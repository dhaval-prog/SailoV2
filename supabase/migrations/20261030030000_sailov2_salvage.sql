-- Salvage (src/salvage.js): shipwrecks with loot, wooden planks floating at sea, and planks sold at the Fish Market.
-- - A captain's boat wrecked by another captain leaves a wreck holding half their coins and half of each kind of fish in
--   their hold (rounded down: an odd one stays with them) and 5 planks; a local sailor's wreck holds the planks. The loot
--   is worked out once, in the same transaction that wrecks the boat, so nothing can be paid twice.
-- - Anyone close enough may salvage a wreck (not its own captain): each line (the coins, the planks, a kind of fish) goes
--   to whoever takes it first. Fish only as far as your hold has room. A wreck floats for a while, then it's gone.
-- - Floating planks come from a shared schedule (the chart, a square of sea and a time slot, hashed: the same as
--   salvage.js), so the server can tell a real plank from a made-up one; each is picked up once.
-- Settings mirror SALVAGE in src/world-config.js.

create or replace function public.salvage_cfg() returns jsonb language sql immutable as $$ select '{
  "plankPrice": 6, "wreckPlanks": 5, "lootShare": 0.5, "wreckLasts": 600, "reach": 30,
  "plank": { "cell": 600, "slot": 900, "chance": 0.12, "awayFromStation": 600, "reach": 25 }
}'::jsonb $$;

-- ---------- wrecks ----------
create table public.wrecks (
  id bigserial primary key,
  chart text not null, x double precision not null, z double precision not null,
  victim uuid references auth.users on delete set null,  -- a captain's boat (null for a local sailor's)
  npc text,                                              -- or a local sailor's
  name text not null default '',                         -- whose boat it was
  attacker uuid references auth.users on delete set null, -- who sank it (the last hit gets the credit)
  coins int not null default 0 check (coins >= 0),
  fish jsonb not null default '{}'::jsonb,               -- { fishId: n }
  planks int not null default 0 check (planks >= 0),
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index wrecks_chart on public.wrecks (chart, expires_at);
alter table public.wrecks enable row level security;
revoke all on public.wrecks from anon, authenticated;

-- planks picked up from the sea: one row each, so a plank can only ever be taken once
create table public.plank_picks (
  chart text not null, key text not null, user_id uuid not null references auth.users on delete cascade, at timestamptz not null default now(),
  primary key (chart, key)
);
alter table public.plank_picks enable row level security;
revoke all on public.plank_picks from anon, authenticated;

/** The loot a wrecked captain leaves: half their coins and half of each kind of fish in the boat they were sailing (rounded
    down), taken from them now. Returns { coins, fish }. */
create or replace function public.salvage_take_loot(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy; share numeric := (public.salvage_cfg() ->> 'lootShare')::numeric; c int; k text; v jsonb; n int; drop_n int; fish jsonb := '{}'::jsonb; nb jsonb;
begin
  select * into r from public.economy where user_id = p_user for update;
  if not found then return jsonb_build_object('coins', 0, 'fish', '{}'::jsonb); end if;
  c := floor(r.coins * share)::int; nb := r.boats;
  for k, v in select * from jsonb_each(coalesce(r.boats -> r.active -> 'hold', '{}'::jsonb)) loop
    n := (v #>> '{}')::int; drop_n := floor(coalesce(n, 0) * share)::int; if drop_n <= 0 then continue; end if;
    fish := fish || jsonb_build_object(k, drop_n);
    nb := case when n - drop_n > 0 then jsonb_set(nb, array[r.active, 'hold', k], to_jsonb(n - drop_n)) else nb #- array[r.active, 'hold', k] end;
  end loop;
  update public.economy set coins = coins - c, boats = nb, updated_at = now() where user_id = p_user;
  insert into public.economy_log (user_id, kind, coins, detail) values (p_user, 'wrecked', -c, jsonb_build_object('boat', r.active, 'fish', fish));
  return jsonb_build_object('coins', c, 'fish', fish);
end $$;
revoke execute on function public.salvage_take_loot(uuid) from public, anon, authenticated;

create or replace function public.salvage_wreck(p_chart text, p_x double precision, p_z double precision, p_victim uuid, p_npc text, p_attacker uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare c jsonb := public.salvage_cfg(); loot jsonb := jsonb_build_object('coins', 0, 'fish', '{}'::jsonb); nm text; wid bigint;
begin
  if p_victim is not null then
    loot := public.salvage_take_loot(p_victim);
    select coalesce(nullif(raw_user_meta_data ->> 'captain', ''), 'A captain') into nm from auth.users where id = p_victim;
  end if;
  insert into public.wrecks (chart, x, z, victim, npc, name, attacker, coins, fish, planks, expires_at)
    values (p_chart, p_x, p_z, p_victim, p_npc, coalesce(nm, ''), p_attacker, (loot ->> 'coins')::int, loot -> 'fish', (c ->> 'wreckPlanks')::int,
      now() + make_interval(secs => (c ->> 'wreckLasts')::double precision))
    returning id into wid;
  return wid;
end $$;
revoke execute on function public.salvage_wreck(text, double precision, double precision, uuid, text, uuid) from public, anon, authenticated;

-- the local sailors there are (src/cpu-captains.js ROSTER): only they can be shot at, so no made-up boats to sink for loot
create table public.npc_roster (chart text not null, npc text not null, primary key (chart, npc));
alter table public.npc_roster enable row level security;
revoke all on public.npc_roster from anon, authenticated;
insert into public.npc_roster (chart, npc) select 'pune', unnest(array['arjun', 'priya', 'ravi', 'meera', 'sameer', 'ananya', 'vikram', 'fatima', 'rohan', 'sneha',
  'kabir', 'isha', 'dev', 'nisha', 'aditya', 'zoya', 'harsh', 'kavya', 'omkar', 'riya']);

-- combat_hit, as before, now leaving a wreck when a boat goes down (in the same transaction: worked out once)
create or replace function public.combat_hit(p_shot bigint, p_kind text, p_target text, p_x double precision, p_z double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c jsonb := public.combat_cfg(); s public.combat_shots; tp public.combat_pos; th public.combat_hull; nh public.npc_hull;
  dmg int := (c ->> 'damage')::int; tid uuid; sank boolean := false; nhp int; wid bigint;
begin
  select * into s from public.combat_shots where id = p_shot and user_id = me for update;
  if s.id is null or s.resolved then raise exception 'no_such_shot' using errcode = 'P0001'; end if;
  if s.fired_at < now() - interval '8 seconds' then raise exception 'too_late' using errcode = 'P0001'; end if;
  update public.combat_shots set resolved = true where id = s.id;
  if sqrt(power(p_x - s.x, 2) + power(p_z - s.z, 2)) > (c ->> 'range')::numeric + 25 then raise exception 'out_of_range' using errcode = 'P0001'; end if;
  if public.combat_safe(s.chart, p_x, p_z) then raise exception 'safe_harbour' using errcode = 'P0001'; end if;
  if p_kind = 'player' then
    begin tid := p_target::uuid; exception when others then raise exception 'no_such_target' using errcode = 'P0001'; end;
    if tid = me then raise exception 'not_yourself' using errcode = 'P0001'; end if;
    select * into tp from public.combat_pos where user_id = tid;
    if tp.user_id is null or tp.chart <> s.chart or tp.at < now() - make_interval(secs => (c ->> 'fresh')::double precision)
       or sqrt(power(tp.x - p_x, 2) + power(tp.z - p_z, 2)) > 25 then raise exception 'missed' using errcode = 'P0001'; end if;
    if public.combat_safe(s.chart, tp.x, tp.z) then raise exception 'safe_harbour' using errcode = 'P0001'; end if;
    th := public.combat_hull_row(tid);
    if th.wrecked_at is not null then raise exception 'already_wrecked' using errcode = 'P0001'; end if;
    nhp := greatest(0, th.hp - dmg); sank := nhp = 0;
    update public.combat_hull set hp = nhp, hit_at = now(), hit_by = me, wrecked_at = case when sank then now() else null end, wrecked_by = case when sank then me else null end, updated_at = now()
      where user_id = tid;
    if sank then wid := public.salvage_wreck(s.chart, tp.x, tp.z, tid, null, me); end if;
  elsif p_kind = 'npc' then
    if not exists (select 1 from public.npc_roster where chart = s.chart and npc = p_target) then raise exception 'no_such_target' using errcode = 'P0001'; end if;
    insert into public.npc_hull (chart, npc) values (s.chart, p_target) on conflict do nothing;
    select * into nh from public.npc_hull where chart = s.chart and npc = p_target for update;
    if nh.sunk_until > now() then raise exception 'already_wrecked' using errcode = 'P0001'; end if;
    nhp := greatest(0, case when nh.sunk_until is not null then (c ->> 'hull')::int else nh.hp end - dmg); sank := nhp = 0;
    update public.npc_hull set hp = case when sank then (c ->> 'hull')::int else nhp end, hit_at = now(),
      sunk_until = case when sank then now() + make_interval(secs => (c ->> 'npcSunk')::double precision) else null end
      where chart = s.chart and npc = p_target;
    if sank then wid := public.salvage_wreck(s.chart, p_x, p_z, null, p_target, me); end if;
  else raise exception 'no_such_target' using errcode = 'P0001'; end if;
  update public.combat_shots set target_kind = p_kind, target = p_target, damage = dmg, wrecked = sank where id = s.id;
  return jsonb_build_object('hp', nhp, 'hull', (c ->> 'hull')::int, 'damage', dmg, 'wrecked', sank, 'wreck', wid);
end $$;
revoke execute on function public.combat_hit(bigint, text, text, double precision, double precision) from public, anon;
grant execute on function public.combat_hit(bigint, text, text, double precision, double precision) to authenticated;

/** Wrecks afloat on a chart, with what's left in them. */
create or replace function public.salvage_wrecks(p_chart text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'x', x, 'z', z, 'name', name, 'npc', npc, 'mine', victim = auth.uid(), 'coins', coins, 'fish', fish, 'planks', planks,
    'left', extract(epoch from expires_at - now())::int) order by id), '[]'::jsonb)
  from public.wrecks where chart = p_chart and expires_at > now() $$;

/** Salvage a wreck: 'coins', 'planks', 'fish:<id>' or 'all'. You must be close (by your own reports), afloat, and not
    its captain. Fish go into the hold of the boat you're sailing, as far as there's room. */
create or replace function public.salvage_take(p_wreck bigint, p_item text, p_x double precision, p_z double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c jsonb := public.salvage_cfg(); w public.wrecks; r public.economy := public.econ_row(); pos public.combat_pos; h public.combat_hull;
  cap int; room int; k text; v jsonb; n int; got_coins int := 0; got_planks int := 0; got_fish jsonb := '{}'::jsonb; nb jsonb; wf jsonb;
begin
  select * into w from public.wrecks where id = p_wreck for update;
  if w.id is null or w.expires_at <= now() then raise exception 'wreck_gone' using errcode = 'P0001'; end if;
  if w.victim = me then raise exception 'own_wreck' using errcode = 'P0001'; end if;
  select * into h from public.combat_hull where user_id = me; if h.wrecked_at is not null then raise exception 'wrecked' using errcode = 'P0001'; end if;
  select * into pos from public.combat_pos where user_id = me;
  if pos.user_id is null or pos.chart <> w.chart or pos.at < now() - make_interval(secs => (public.combat_cfg() ->> 'fresh')::double precision)
     or sqrt(power(pos.x - p_x, 2) + power(pos.z - p_z, 2)) > 30 then raise exception 'where_are_you' using errcode = 'P0001'; end if;
  if sqrt(power(w.x - p_x, 2) + power(w.z - p_z, 2)) > (c ->> 'reach')::numeric then raise exception 'too_far' using errcode = 'P0001'; end if;
  if p_item in ('coins', 'all') then got_coins := w.coins; end if;
  if p_item in ('planks', 'all') then got_planks := w.planks; end if;
  nb := r.boats; wf := w.fish; cap := (public.econ_boat(r.active) ->> 'hold')::int; room := cap - public.econ_held(r, r.active);
  for k, v in select * from jsonb_each(w.fish) loop
    if not (p_item = 'all' or p_item = 'fish:' || k) then continue; end if;
    n := least((v #>> '{}')::int, greatest(0, room)); if n <= 0 then continue; end if;
    room := room - n; got_fish := got_fish || jsonb_build_object(k, n);
    nb := jsonb_set(nb, array[r.active, 'hold', k], to_jsonb(coalesce((nb #>> array[r.active, 'hold', k])::int, 0) + n));
    wf := case when (v #>> '{}')::int - n > 0 then jsonb_set(wf, array[k], to_jsonb((v #>> '{}')::int - n)) else wf - k end;
  end loop;
  if got_coins = 0 and got_planks = 0 and got_fish = '{}'::jsonb then
    raise exception '%', case when p_item like 'fish:%' and w.fish ? substr(p_item, 6) or p_item = 'all' and w.fish <> '{}'::jsonb then 'hold_full' else 'nothing_left' end using errcode = 'P0001'; end if;
  update public.wrecks set coins = coins - got_coins, planks = planks - got_planks, fish = wf where id = w.id returning * into w;
  update public.economy set coins = coins + got_coins, planks = planks + got_planks, boats = nb, updated_at = now() where user_id = me returning * into r;
  perform public.econ_log('salvage', got_coins, jsonb_build_object('wreck', w.id, 'planks', got_planks, 'fish', got_fish));
  return public.econ_out(r, jsonb_build_object('got', jsonb_build_object('coins', got_coins, 'planks', got_planks, 'fish', got_fish),
    'wreck', jsonb_build_object('id', w.id, 'coins', w.coins, 'fish', w.fish, 'planks', w.planks)));
end $$;

-- ---------- planks floating at sea (the same schedule as src/salvage.js) ----------
create or replace function public.plank_at(p_chart text, p_i int, p_j int, p_k bigint) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.salvage_cfg() -> 'plank'; cell numeric := (c ->> 'cell')::numeric; key text := p_chart || ':' || p_i || ':' || p_j || ':' || p_k; px numeric; pz numeric;
begin
  if public.mkt_hash('plk:' || key)::numeric / 4294967296 >= (c ->> 'chance')::numeric then return null; end if;
  px := (p_i + 0.15 + 0.7 * public.mkt_hash('plkx:' || key)::numeric / 4294967296) * cell;
  pz := (p_j + 0.15 + 0.7 * public.mkt_hash('plkz:' || key)::numeric / 4294967296) * cell;
  if exists (select 1 from public.chart_station s where s.chart = p_chart and sqrt(power(s.x - px, 2) + power(s.z - pz, 2)) < (c ->> 'awayFromStation')::numeric) then return null; end if;
  return jsonb_build_object('x', px, 'z', pz);
end $$;
revoke execute on function public.plank_at(text, int, int, bigint) from public, anon, authenticated;

/** Planks already picked up on a chart in the current and last time slots ('i:j:k' each). */
create or replace function public.planks_taken(p_chart text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(substr(key, length(p_chart) + 2)), '[]'::jsonb) from public.plank_picks
  where chart = p_chart and at > now() - make_interval(secs => 2 * ((public.salvage_cfg() -> 'plank' ->> 'slot')::double precision)) $$;

/** Pick up a floating plank: it must be on the schedule now (or the slot just gone), not yet taken, and you close to it. */
create or replace function public.plank_pick(p_chart text, p_i int, p_j int, p_k bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c jsonb := public.salvage_cfg() -> 'plank'; k_now bigint := floor(extract(epoch from now()) / (c ->> 'slot')::numeric);
  p jsonb; pos public.combat_pos; h public.combat_hull; r public.economy := public.econ_row();
begin
  if p_k not in (k_now, k_now - 1) then raise exception 'plank_gone' using errcode = 'P0001'; end if;
  p := public.plank_at(p_chart, p_i, p_j, p_k); if p is null then raise exception 'no_such_plank' using errcode = 'P0001'; end if;
  select * into h from public.combat_hull where user_id = me; if h.wrecked_at is not null then raise exception 'wrecked' using errcode = 'P0001'; end if;
  select * into pos from public.combat_pos where user_id = me;
  if pos.user_id is null or pos.chart <> p_chart or pos.at < now() - make_interval(secs => (public.combat_cfg() ->> 'fresh')::double precision)
     or sqrt(power(pos.x - (p ->> 'x')::numeric, 2) + power(pos.z - (p ->> 'z')::numeric, 2)) > (c ->> 'reach')::numeric then raise exception 'too_far' using errcode = 'P0001'; end if;
  insert into public.plank_picks (chart, key, user_id) values (p_chart, p_chart || ':' || p_i || ':' || p_j || ':' || p_k, me) on conflict do nothing;
  if not found then raise exception 'plank_taken' using errcode = 'P0001'; end if;
  update public.economy set planks = planks + 1, updated_at = now() where user_id = me returning * into r;
  perform public.econ_log('plank', 0, jsonb_build_object('key', p_i || ':' || p_j || ':' || p_k));
  return public.econ_out(r, jsonb_build_object('got', 1));
end $$;

/** Sell planks at the Fish Market (moored): a fixed price each, not a fish's. */
create or replace function public.econ_sell_planks(p_n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); n int := coalesce(p_n, 0); paid int;
begin
  if not public.econ_docked() then raise exception 'not_docked' using errcode = 'P0001'; end if;
  if n <= 0 then raise exception 'nothing_to_sell' using errcode = 'P0001'; end if;
  if n > r.planks then raise exception 'not_enough_planks' using errcode = 'P0001'; end if;
  paid := n * (public.salvage_cfg() ->> 'plankPrice')::int;
  update public.economy set planks = planks - n, coins = coins + paid, updated_at = now() where user_id = r.user_id returning * into r;
  perform public.econ_log('sell_planks', paid, jsonb_build_object('n', n));
  return public.econ_out(r, jsonb_build_object('paid', paid, 'sold', n));
end $$;

do $$ declare f text; begin
  foreach f in array array['salvage_wrecks(text)', 'salvage_take(bigint, text, double precision, double precision)', 'planks_taken(text)',
    'plank_pick(text, int, int, bigint)', 'econ_sell_planks(int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;
