-- Naval combat (src/combat.js): cannons and cannonballs bought at Paradise Station, a hull to damage, and shots the
-- server checks. A ball's flight is worked out on the firing captain's device (there's no game server); the server
-- decides whether a shot may be fired (a cannon, a ball, reloaded, outside the safe harbour, where you said you were)
-- and whether a hit counts (your recent shot, a target that is really there by its own reports, in range, outside the
-- safe harbour, not yourself, not already wrecked). Settings mirror COMBAT in src/world-config.js.

create or replace function public.combat_cfg() returns jsonb language sql immutable as $$ select '{
  "cannonPrice": 300, "ballPrice": 4, "startBalls": 10, "maxBalls": 40,
  "hull": 100, "damage": 25, "reload": 4, "range": 140, "repairPerHp": 2,
  "safeRadius": 450, "fresh": 6, "npcSunk": 600
}'::jsonb $$;

-- the economy's tidy-up of each boat now keeps its cannon (owned, and the balls in its rack)
create or replace function public.econ_boats(p jsonb) returns jsonb language plpgsql stable as $$
declare out jsonb := '{}'::jsonb; b text; spec jsonb; v jsonb; hold jsonb; k text; n int; h jsonb;
begin
  for b, spec in select * from jsonb_each(public.econ_cfg() -> 'boats') loop
    v := coalesce(p -> b, '{}'::jsonb); hold := '{}'::jsonb;
    if jsonb_typeof(v -> 'hold') = 'object' then
      for k, h in select * from jsonb_each(v -> 'hold') loop
        n := greatest(0, least(500, coalesce((h #>> '{}')::numeric, 0)::int));
        if n > 0 and exists (select 1 from public.fish_species where id = k) then hold := hold || jsonb_build_object(k, n); end if;
      end loop;
    end if;
    out := out || jsonb_build_object(b, jsonb_build_object(
      'fuel', greatest(0, least((spec ->> 'fuel')::numeric, coalesce((v ->> 'fuel')::numeric, (spec ->> 'fuel')::numeric))),
      'hold', hold,
      'nos', jsonb_build_object('owned', coalesce((v #>> '{nos,owned}')::boolean, false),
        'charge', greatest(0, least((public.econ_cfg() #>> '{nos,capacity}')::numeric, coalesce((v #>> '{nos,charge}')::numeric, 0)))),
      'cannon', jsonb_build_object('owned', coalesce((v #>> '{cannon,owned}')::boolean, false),
        'balls', greatest(0, least((public.combat_cfg() ->> 'maxBalls')::int, coalesce((v #>> '{cannon,balls}')::numeric, 0)::int)))));
  end loop;
  return out;
end $$;

-- where each captain is, told every couple of seconds while at sea (what hits are checked against)
create table public.combat_pos (
  user_id uuid primary key references auth.users on delete cascade,
  chart text not null, x double precision not null, z double precision not null, at timestamptz not null default now()
);
alter table public.combat_pos enable row level security;
revoke all on public.combat_pos from anon, authenticated;

-- the safe harbour of each chart: Paradise Station (the first captain on a chart sets it; Pune's is fixed)
create table public.chart_station (chart text primary key, x double precision not null, z double precision not null);
alter table public.chart_station enable row level security;
create policy "stations: read" on public.chart_station for select using (true);
revoke insert, update, delete on public.chart_station from anon, authenticated;
insert into public.chart_station (chart, x, z) values ('pune', -5954.5737, 1770.2784);

-- each captain's hull (the boat they're sailing)
create table public.combat_hull (
  user_id uuid primary key references auth.users on delete cascade,
  hp int not null default 100 check (hp >= 0), last_fire timestamptz, wrecked_at timestamptz, wrecked_by uuid,
  hit_at timestamptz, hit_by uuid, updated_at timestamptz not null default now()
);
alter table public.combat_hull enable row level security;
create policy "hulls: read" on public.combat_hull for select to authenticated using (true); -- (everyone sees who is damaged)
revoke insert, update, delete on public.combat_hull from anon, authenticated;

-- the local sailors' hulls, per chart (shared: everyone sees a sunk one)
create table public.npc_hull (
  chart text not null, npc text not null, hp int not null default 100 check (hp >= 0), sunk_until timestamptz, hit_at timestamptz,
  primary key (chart, npc)
);
alter table public.npc_hull enable row level security;
create policy "npc hulls: read" on public.npc_hull for select using (true);
revoke insert, update, delete on public.npc_hull from anon, authenticated;

-- every shot, and what it hit
create table public.combat_shots (
  id bigserial primary key, user_id uuid not null references auth.users on delete cascade, chart text not null,
  x double precision not null, z double precision not null, aim_x double precision not null, aim_z double precision not null,
  fired_at timestamptz not null default now(), resolved boolean not null default false,
  target_kind text, target text, damage int, wrecked boolean
);
create index combat_shots_user on public.combat_shots (user_id, fired_at desc);
alter table public.combat_shots enable row level security;
create policy "shots: read your own" on public.combat_shots for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.combat_shots from anon, authenticated;

create or replace function public.combat_safe(p_chart text, p_x double precision, p_z double precision) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chart_station s where s.chart = p_chart and sqrt(power(s.x - p_x, 2) + power(s.z - p_z, 2)) < (public.combat_cfg() ->> 'safeRadius')::numeric) $$;
create or replace function public.combat_hull_row(p_user uuid) returns public.combat_hull language plpgsql security definer set search_path = public as $$
declare h public.combat_hull;
begin insert into public.combat_hull (user_id) values (p_user) on conflict do nothing; select * into h from public.combat_hull where user_id = p_user for update; return h; end $$;
create or replace function public.combat_out(h public.combat_hull, extra jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('hp', h.hp, 'hull', (public.combat_cfg() ->> 'hull')::int, 'wrecked', h.wrecked_at is not null, 'lastFire', h.last_fire, 'now', now()) || extra $$;

/** Where I am (every couple of seconds at sea); the first report on a chart also records its station, if unknown. */
create or replace function public.combat_here(p_chart text, p_x double precision, p_z double precision, p_station_x double precision default null, p_station_z double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.combat_hull;
begin
  if me is null then raise exception 'signed_out' using errcode = 'P0001'; end if;
  if abs(p_x) > 20000 or abs(p_z) > 20000 or char_length(p_chart) not between 1 and 80 then raise exception 'bad_position' using errcode = 'P0001'; end if;
  insert into public.combat_pos (user_id, chart, x, z, at) values (me, p_chart, p_x, p_z, now())
    on conflict (user_id) do update set chart = excluded.chart, x = excluded.x, z = excluded.z, at = now();
  if p_station_x is not null and abs(p_station_x) <= 20000 and abs(p_station_z) <= 20000 then
    insert into public.chart_station (chart, x, z) values (p_chart, p_station_x, p_station_z) on conflict do nothing; end if;
  h := public.combat_hull_row(me); return public.combat_out(h);
end $$;

/** My hull. */
create or replace function public.combat_me() returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.combat_hull := public.combat_hull_row(auth.uid()); begin return public.combat_out(h); end $$;

/** Buy a cannon for a boat (it comes with a few balls). */
create or replace function public.econ_cannon_buy(p_boat text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); c jsonb := public.combat_cfg(); price int := (c ->> 'cannonPrice')::int;
begin
  perform public.econ_boat(p_boat);
  if coalesce((r.boats #>> array[p_boat, 'cannon', 'owned'])::boolean, false) then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if r.coins < price then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - price, boats = jsonb_set(boats, array[p_boat, 'cannon'], jsonb_build_object('owned', true, 'balls', (c ->> 'startBalls')::int)), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('cannon_buy', -price, jsonb_build_object('boat', p_boat));
  return public.econ_out(r, jsonb_build_object('paid', price));
end $$;

/** Buy cannonballs for a boat's cannon (up to the rack's size). */
create or replace function public.econ_balls_buy(p_boat text, p_n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); c jsonb := public.combat_cfg(); have int; n int; cost int;
begin
  perform public.econ_boat(p_boat);
  if not coalesce((r.boats #>> array[p_boat, 'cannon', 'owned'])::boolean, false) then raise exception 'no_cannon' using errcode = 'P0001'; end if;
  have := coalesce((r.boats #>> array[p_boat, 'cannon', 'balls'])::int, 0); n := least(greatest(0, coalesce(p_n, 0)), (c ->> 'maxBalls')::int - have);
  if n <= 0 then raise exception 'rack_full' using errcode = 'P0001'; end if;
  cost := n * (c ->> 'ballPrice')::int;
  if r.coins < cost then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - cost, boats = jsonb_set(boats, array[p_boat, 'cannon', 'balls'], to_jsonb(have + n)), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('balls_buy', -cost, jsonb_build_object('boat', p_boat, 'n', n));
  return public.econ_out(r, jsonb_build_object('paid', cost, 'n', n));
end $$;

/** Fire: one ball from the boat's cannon, from where I am toward an aim point in range. Returns { shot, balls }. */
create or replace function public.combat_fire(p_boat text, p_chart text, p_x double precision, p_z double precision, p_aim_x double precision, p_aim_z double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.economy := public.econ_row(); c jsonb := public.combat_cfg(); h public.combat_hull := public.combat_hull_row(me);
  pos public.combat_pos; balls int; sid bigint;
begin
  perform public.econ_boat(p_boat);
  if not coalesce((r.boats #>> array[p_boat, 'cannon', 'owned'])::boolean, false) then raise exception 'no_cannon' using errcode = 'P0001'; end if;
  balls := coalesce((r.boats #>> array[p_boat, 'cannon', 'balls'])::int, 0);
  if balls <= 0 then raise exception 'no_balls' using errcode = 'P0001'; end if;
  if h.wrecked_at is not null then raise exception 'wrecked' using errcode = 'P0001'; end if;
  if h.last_fire > now() - make_interval(secs => (c ->> 'reload')::double precision) then raise exception 'reloading' using errcode = 'P0001'; end if;
  select * into pos from public.combat_pos where user_id = me;
  if pos.user_id is null or pos.chart <> p_chart or pos.at < now() - make_interval(secs => (c ->> 'fresh')::double precision)
     or sqrt(power(pos.x - p_x, 2) + power(pos.z - p_z, 2)) > 60 then raise exception 'where_are_you' using errcode = 'P0001'; end if;
  if public.combat_safe(p_chart, p_x, p_z) then raise exception 'safe_harbour' using errcode = 'P0001'; end if;
  if sqrt(power(p_aim_x - p_x, 2) + power(p_aim_z - p_z, 2)) > (c ->> 'range')::numeric + 5 then raise exception 'out_of_range' using errcode = 'P0001'; end if;
  update public.economy set boats = jsonb_set(boats, array[p_boat, 'cannon', 'balls'], to_jsonb(balls - 1)), updated_at = now() where user_id = me returning * into r;
  update public.combat_hull set last_fire = now(), updated_at = now() where user_id = me;
  insert into public.combat_shots (user_id, chart, x, z, aim_x, aim_z) values (me, p_chart, p_x, p_z, p_aim_x, p_aim_z) returning id into sid;
  return public.econ_out(r, jsonb_build_object('shot', sid, 'balls', balls - 1));
end $$;

/** A shot landed on a boat: 'player' (their user id) or 'npc' (a local sailor's id), at x, z. Returns what it did. */
create or replace function public.combat_hit(p_shot bigint, p_kind text, p_target text, p_x double precision, p_z double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c jsonb := public.combat_cfg(); s public.combat_shots; tp public.combat_pos; th public.combat_hull; nh public.npc_hull;
  dmg int := (c ->> 'damage')::int; tid uuid; sank boolean := false; nhp int;
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
  elsif p_kind = 'npc' then
    if char_length(p_target) not between 1 and 40 then raise exception 'no_such_target' using errcode = 'P0001'; end if;
    insert into public.npc_hull (chart, npc) values (s.chart, p_target) on conflict do nothing;
    select * into nh from public.npc_hull where chart = s.chart and npc = p_target for update;
    if nh.sunk_until > now() then raise exception 'already_wrecked' using errcode = 'P0001'; end if;
    nhp := greatest(0, case when nh.sunk_until is not null then (c ->> 'hull')::int else nh.hp end - dmg); sank := nhp = 0;
    update public.npc_hull set hp = case when sank then (c ->> 'hull')::int else nhp end, hit_at = now(),
      sunk_until = case when sank then now() + make_interval(secs => (c ->> 'npcSunk')::double precision) else null end
      where chart = s.chart and npc = p_target;
  else raise exception 'no_such_target' using errcode = 'P0001'; end if;
  update public.combat_shots set target_kind = p_kind, target = p_target, damage = dmg, wrecked = sank where id = s.id;
  return jsonb_build_object('hp', nhp, 'hull', (c ->> 'hull')::int, 'damage', dmg, 'wrecked', sank);
end $$;

/** Repair the hull at the Boathouse (moored): coins per point. */
create or replace function public.combat_repair() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.economy := public.econ_row(); c jsonb := public.combat_cfg(); h public.combat_hull := public.combat_hull_row(me); need int; cost int;
begin
  if not public.econ_docked() then raise exception 'not_docked' using errcode = 'P0001'; end if;
  need := (c ->> 'hull')::int - h.hp; if need <= 0 then raise exception 'hull_fine' using errcode = 'P0001'; end if;
  cost := need * (c ->> 'repairPerHp')::int;
  if r.coins < cost then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - cost, updated_at = now() where user_id = me returning * into r;
  update public.combat_hull set hp = (c ->> 'hull')::int, updated_at = now() where user_id = me returning * into h;
  perform public.econ_log('repair', -cost, jsonb_build_object('hp', need));
  return public.econ_out(r, jsonb_build_object('paid', cost, 'hp', h.hp));
end $$;

/** After a wreck: back at Paradise Station with a sound hull (the boat is towed in and patched up). */
create or replace function public.combat_respawn() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.combat_hull := public.combat_hull_row(me);
begin
  if h.wrecked_at is null then return public.combat_out(h); end if;
  update public.combat_hull set hp = (public.combat_cfg() ->> 'hull')::int, wrecked_at = null, wrecked_by = null, updated_at = now() where user_id = me returning * into h;
  return public.combat_out(h);
end $$;

/** Damaged and sunk local sailors on a chart (sunk ones come back after a while). */
create or replace function public.combat_npcs(p_chart text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('npc', npc, 'hp', hp, 'sunk', sunk_until > now())), '[]'::jsonb) from public.npc_hull
  where chart = p_chart and (hp < (public.combat_cfg() ->> 'hull')::int or sunk_until > now()) and (hit_at > now() - interval '30 minutes' or sunk_until > now()) $$;

revoke execute on function public.combat_hull_row(uuid) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['combat_here(text, double precision, double precision, double precision, double precision)', 'combat_me()', 'econ_cannon_buy(text)', 'econ_balls_buy(text, int)',
    'combat_fire(text, text, double precision, double precision, double precision, double precision)', 'combat_hit(bigint, text, text, double precision, double precision)',
    'combat_repair()', 'combat_respawn()', 'combat_npcs(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;
