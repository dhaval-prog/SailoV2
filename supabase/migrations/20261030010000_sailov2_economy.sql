-- Server-checked economy (src/econ.js): coins, each boat's fuel, fish hold and NOS, wooden planks, one-off rewards.
-- The game used to keep these on the device (mirrored to player_progress, which the device writes); now, for a
-- signed-in captain, this table is the record and it changes only through the functions below, which check every
-- purchase, sale, refuel and catch (enough coins, room in the hold, prices from the market formula, docked to refuel,
-- a catch at most every 3 s) and log it. The first call for a captain imports their existing save once.
-- Settings mirror ECONOMY in src/world-config.js (keep the two in step).

-- the species' base prices (the game's list: station.js, fish-species.js, fish-species-2.js)
create table public.fish_species (id text primary key, price int not null check (price > 0));
alter table public.fish_species enable row level security;
create policy "fish species: read" on public.fish_species for select using (true);
insert into public.fish_species (id, price) values
  ('sardine', 4),
  ('mackerel', 9),
  ('snapper', 16),
  ('puffer', 24),
  ('tuna', 42),
  ('cod', 14),
  ('flounder', 12),
  ('barracuda', 35),
  ('mahi', 48),
  ('swordfish', 95),
  ('sailfish', 120),
  ('permit', 55),
  ('johndory', 32),
  ('pomfret', 28),
  ('kingfish', 38),
  ('hilsa', 22),
  ('yellowtail', 40),
  ('seabream', 30),
  ('salmon', 45),
  ('halibut', 60),
  ('seabass', 26),
  ('redmullet', 18),
  ('reddrum', 30),
  ('stripedbass', 34),
  ('barramundi', 50),
  ('greatwhite', 220),
  ('whaleshark', 260),
  ('tigershark', 180),
  ('hammerhead', 190),
  ('bullshark', 150),
  ('nurseshark', 90),
  ('leopardshark', 85),
  ('goblinshark', 240),
  ('baskingshark', 210),
  ('thresher', 170),
  ('reefshark', 110),
  ('sawfish', 200),
  ('manta', 200),
  ('stingray', 45),
  ('electricray', 60),
  ('eagleray', 90),
  ('seahorse', 70),
  ('pipefish', 30),
  ('anglerfish', 140),
  ('oarfish', 230),
  ('molamola', 160),
  ('boxfish', 35),
  ('cowfish', 40),
  ('porcupine', 32),
  ('stonefish', 75),
  ('scorpionfish', 48),
  ('flyingfish', 26),
  ('mudskipper', 18),
  ('coelacanth', 320),
  ('lungfish', 95),
  ('carp', 14),
  ('koi', 65),
  ('goldfish', 12),
  ('catfish', 20),
  ('channelcat', 24),
  ('bluecat', 45),
  ('corydoras', 10),
  ('pleco', 22),
  ('tilapia', 9),
  ('nileperch', 70),
  ('niletilapia', 11),
  ('largemouth', 30),
  ('smallmouth', 28),
  ('trout', 24),
  ('rainbowtrout', 30),
  ('browntrout', 32),
  ('pike', 40),
  ('muskie', 85),
  ('walleye', 34),
  ('perch', 12),
  ('crappie', 14),
  ('bluegill', 10),
  ('pumpkinseed', 11),
  ('sturgeon', 150),
  ('paddlefish', 110),
  ('piranha', 30),
  ('pacu', 26),
  ('arapaima', 180),
  ('eel', 34),
  ('bichir', 55),
  ('gar', 48),
  ('bowfin', 38),
  ('snakehead', 36),
  ('mahseer', 90),
  ('rohu', 16),
  ('catla', 18),
  ('mrigal', 15),
  ('walkingcat', 14),
  ('fwstingray', 80),
  ('grasscarp', 18),
  ('silvercarp', 14),
  ('singhi', 20),
  ('pangasius', 16),
  ('anabas', 15),
  ('pabda', 22),
  ('tengra', 14),
  ('bata', 10),
  ('chital', 45),
  ('featherback', 24),
  ('wallago', 55),
  ('goonch', 140),
  ('garra', 12),
  ('zebradanio', 8),
  ('glassfish', 10),
  ('viperfish', 120),
  ('fangtooth', 110),
  ('gulpereel', 150),
  ('dragonfish', 130),
  ('lanternfish', 30),
  ('hatchetfish', 40),
  ('barreleye', 180),
  ('blobfish', 90),
  ('tripodfish', 85),
  ('blackswallower', 95),
  ('snailfish', 70),
  ('chimaera', 120),
  ('bristlemouth', 20),
  ('loosejaw', 140),
  ('footballfish', 160),
  ('cookiecutter', 120),
  ('clownfish', 30),
  ('parrotfish', 34),
  ('surgeonfish', 28),
  ('yellowtang', 32),
  ('damselfish', 14),
  ('butterflyfish', 26),
  ('rabbitfish', 20),
  ('goatfish', 18),
  ('mullet', 12),
  ('needlefish', 22),
  ('halfbeak', 12),
  ('garfish', 18),
  ('mojarra', 10),
  ('grunt', 14),
  ('pompano', 30),
  ('snook', 36),
  ('mangrovejack', 34),
  ('reefsnapper', 26),
  ('grouper', 60),
  ('silverbiddy', 10),
  ('flathead', 24),
  ('goby', 8),
  ('blenny', 9),
  ('cardinalfish', 12),
  ('roach', 9),
  ('rudd', 10),
  ('bream', 12),
  ('tench', 16),
  ('chub', 11),
  ('dace', 8),
  ('minnow', 4),
  ('whitefish', 20),
  ('grayling', 26),
  ('char', 34),
  ('cisco', 14),
  ('sucker', 9),
  ('fwdrum', 16),
  ('archerfish', 30),
  ('electriceel', 90),
  ('electriccat', 60),
  ('frogfish', 50),
  ('seadragon', 160),
  ('ribboneel', 70),
  ('gardeneel', 22),
  ('remora', 20),
  ('cleanerwrasse', 16);

create table public.economy (
  user_id uuid primary key references auth.users on delete cascade,
  coins int not null default 60 check (coins >= 0),
  planks int not null default 0 check (planks >= 0),
  active text not null default 'tug' check (active in ('tug', 'sail', 'yacht', 'dinghy')),
  boats jsonb not null default '{}'::jsonb,  -- { tug: { fuel, hold: { fishId: n }, nos: { owned, charge } }, ... }
  rewards jsonb not null default '{}'::jsonb, -- one-off rewards already paid ('voyage1' ...)
  last_catch timestamptz,
  boost_until timestamptz, boost_ready timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.economy enable row level security;
create policy "economy: read your own" on public.economy for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.economy from anon, authenticated;

-- every change, for the record
create table public.economy_log (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null, coins int not null default 0, detail jsonb, at timestamptz not null default now()
);
create index economy_log_user on public.economy_log (user_id, at desc);
alter table public.economy_log enable row level security;
create policy "economy log: read your own" on public.economy_log for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.economy_log from anon, authenticated;

-- ---------- settings (ECONOMY in src/world-config.js) ----------
create or replace function public.econ_cfg() returns jsonb language sql immutable as $$ select '{
  "fuelPrice": 2, "catchGap": 3, "release": 0.2,
  "boats": { "tug": { "fuel": 120, "hold": 30 }, "sail": { "fuel": 60, "hold": 16 }, "yacht": { "fuel": 240, "hold": 45 }, "dinghy": { "fuel": 20, "hold": 8 } },
  "nos": { "price": 200, "capacity": 12, "burst": 4, "cooldown": 6, "refillPerSec": 5 },
  "rewards": { "voyage1": 10, "voyage2": 15, "voyage3": 25 },
  "market": { "period": 1800, "swing": 0.22, "daily": 0.12, "min": 0.6, "max": 1.6 }
}'::jsonb $$;

-- ---------- the market price (the same formula as src/market.js) ----------
-- 32-bit integer multiply (JavaScript's Math.imul), on unsigned values
create or replace function public.mkt_imul(a bigint, b bigint) returns bigint language sql immutable as $$
  select ((a * (b & 65535)) + (((a * (b >> 16)) & 65535) << 16)) & 4294967295 $$;
create or replace function public.mkt_hash(s text) returns bigint language plpgsql immutable as $$
declare h bigint := 2166136261; i int;
begin
  for i in 1 .. length(s) loop h := public.mkt_imul(h # ascii(substr(s, i, 1))::bigint, 16777619); end loop;
  h := h # (h >> 13); h := public.mkt_imul(h, 1540483477);
  return (h # (h >> 15)) & 4294967295;
end $$;
/** A species' price multiplier now, in a time zone (the chart's): demand drifting between half-hours, and its busy hour. */
create or replace function public.mkt_mult(p_id text, p_tz text) returns numeric language plpgsql stable as $$
declare c jsonb := public.econ_cfg() -> 'market'; per numeric := (c ->> 'period')::numeric * 1000;
  ms numeric := floor(extract(epoch from now()) * 1000); k bigint := floor(ms / per); u numeric := (ms - k * per) / per;
  n0 numeric; n1 numeric; hr numeric; busy int; tz text := 'UTC';
begin
  if exists (select 1 from pg_timezone_names where name = p_tz) then tz := p_tz; end if;
  u := u * u * (3 - 2 * u);
  n0 := public.mkt_hash('mkt:' || p_id || ':' || k)::numeric / 4294967296 * 2 - 1;
  n1 := public.mkt_hash('mkt:' || p_id || ':' || (k + 1))::numeric / 4294967296 * 2 - 1;
  hr := extract(epoch from (now() at time zone tz)::time) / 3600;
  busy := public.mkt_hash('busy:' || p_id) % 24;
  return greatest((c ->> 'min')::numeric, least((c ->> 'max')::numeric,
    1 + (c ->> 'swing')::numeric * (n0 * (1 - u) + n1 * u) + (c ->> 'daily')::numeric * cos((hr - busy) / 24 * 2 * pi())));
end $$;
create or replace function public.mkt_price(p_id text, p_tz text) returns int language sql stable as $$
  select greatest(1, round(f.price * public.mkt_mult(p_id, p_tz))::int) from public.fish_species f where f.id = p_id $$;

-- ---------- helpers ----------
-- the boats, each with its tank (clamped to its size), hold and NOS
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
        'charge', greatest(0, least((public.econ_cfg() #>> '{nos,capacity}')::numeric, coalesce((v #>> '{nos,charge}')::numeric, 0))))));
  end loop;
  return out;
end $$;
-- your row, locked for this change; the first time, your existing save comes across (once)
create or replace function public.econ_row() returns public.economy language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.economy; old jsonb;
begin
  if me is null then raise exception 'signed_out' using errcode = 'P0001'; end if;
  select * into r from public.economy where user_id = me for update;
  if found then return r; end if;
  begin select (data ->> 'sailo:economy')::jsonb into old from public.player_progress where user_id = me; exception when others then old := null; end;
  insert into public.economy (user_id, coins, active, boats)
    values (me, greatest(0, least(100000, coalesce((old ->> 'coins')::numeric, 60)::int)),
      case when old ->> 'active' in ('tug', 'sail', 'yacht', 'dinghy') then old ->> 'active' else 'tug' end,
      public.econ_boats(coalesce(old -> 'boats', jsonb_build_object('tug', jsonb_build_object('fuel', old -> 'fuel', 'hold', old -> 'hold')))))
    on conflict (user_id) do nothing;
  select * into r from public.economy where user_id = me for update;
  insert into public.economy_log (user_id, kind, coins, detail) values (me, 'import', r.coins, jsonb_build_object('from_save', old is not null));
  return r;
end $$;
create or replace function public.econ_out(r public.economy, extra jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('coins', r.coins, 'planks', r.planks, 'active', r.active, 'boats', r.boats, 'rewards', r.rewards,
    'boostReady', r.boost_ready, 'boostUntil', r.boost_until, 'now', now()) || extra $$;
create or replace function public.econ_boat(p_boat text) returns jsonb language plpgsql immutable as $$
begin
  if public.econ_cfg() -> 'boats' -> p_boat is null then raise exception 'no_such_boat' using errcode = 'P0001'; end if;
  return public.econ_cfg() -> 'boats' -> p_boat;
end $$;
create or replace function public.econ_held(r public.economy, p_boat text) returns int language sql stable as $$
  select coalesce(sum((v #>> '{}')::int), 0)::int from jsonb_each(r.boats -> p_boat -> 'hold') as e(k, v) $$;
-- moored at Paradise Station: your berth booking is current
create or replace function public.econ_docked() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.berth_bookings where user_id = auth.uid() and state in ('reserved', 'occupied') and expires_at > now()) $$;
create or replace function public.econ_log(p_kind text, p_coins int, p_detail jsonb) returns void language sql security definer set search_path = public as $$
  insert into public.economy_log (user_id, kind, coins, detail) values (auth.uid(), p_kind, p_coins, p_detail) $$;

-- ---------- what the game calls ----------
/** Your economy. */
create or replace function public.econ_get() returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row();
begin r.boats := public.econ_boats(r.boats); update public.economy set boats = r.boats where user_id = r.user_id; return public.econ_out(r); end $$;

/** A fish kept: into the hold of a boat (room permitting, at most one every few seconds). */
create or replace function public.econ_catch(p_boat text, p_fish text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); cap int := (public.econ_boat(p_boat) ->> 'hold')::int; n int;
begin
  if not exists (select 1 from public.fish_species where id = p_fish) then raise exception 'no_such_fish' using errcode = 'P0001'; end if;
  if r.last_catch > now() - make_interval(secs => (public.econ_cfg() ->> 'catchGap')::int) then raise exception 'too_soon' using errcode = 'P0001'; end if;
  if public.econ_held(r, p_boat) >= cap then raise exception 'hold_full' using errcode = 'P0001'; end if;
  n := coalesce((r.boats #>> array[p_boat, 'hold', p_fish])::int, 0) + 1;
  update public.economy set boats = jsonb_set(boats, array[p_boat, 'hold', p_fish], to_jsonb(n)), last_catch = now(), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('catch', 0, jsonb_build_object('boat', p_boat, 'fish', p_fish));
  return public.econ_out(r);
end $$;

/** A fish released: a small reward (a fifth of its base price), at most one every few seconds. */
create or replace function public.econ_release(p_fish text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); bonus int;
begin
  select greatest(1, round(price * (public.econ_cfg() ->> 'release')::numeric)::int) into bonus from public.fish_species where id = p_fish;
  if bonus is null then raise exception 'no_such_fish' using errcode = 'P0001'; end if;
  if r.last_catch > now() - make_interval(secs => (public.econ_cfg() ->> 'catchGap')::int) then raise exception 'too_soon' using errcode = 'P0001'; end if;
  update public.economy set coins = coins + bonus, last_catch = now(), updated_at = now() where user_id = r.user_id returning * into r;
  perform public.econ_log('release', bonus, jsonb_build_object('fish', p_fish));
  return public.econ_out(r, jsonb_build_object('paid', bonus));
end $$;

/** Sell fish from a boat's hold at the Fish Market's prices now: { fishId: n }. Moored only. */
create or replace function public.econ_sell(p_boat text, p_items jsonb, p_tz text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); k text; v jsonb; n int; have int; price int; paid int := 0; sold int := 0; lines jsonb := '[]'::jsonb; nb jsonb;
begin
  perform public.econ_boat(p_boat);
  if not public.econ_docked() then raise exception 'not_docked' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'object' then raise exception 'bad_items' using errcode = 'P0001'; end if;
  nb := r.boats;
  for k, v in select * from jsonb_each(p_items) loop
    n := (v #>> '{}')::int; if n is null or n <= 0 then continue; end if;
    have := coalesce((nb #>> array[p_boat, 'hold', k])::int, 0);
    if n > have then raise exception 'not_in_hold' using errcode = 'P0001'; end if;
    price := public.mkt_price(k, p_tz); if price is null then raise exception 'no_such_fish' using errcode = 'P0001'; end if;
    nb := case when have - n > 0 then jsonb_set(nb, array[p_boat, 'hold', k], to_jsonb(have - n)) else nb #- array[p_boat, 'hold', k] end;
    paid := paid + n * price; sold := sold + n; lines := lines || jsonb_build_object('fish', k, 'n', n, 'price', price);
  end loop;
  if sold = 0 then raise exception 'nothing_to_sell' using errcode = 'P0001'; end if;
  update public.economy set boats = nb, coins = coins + paid, updated_at = now() where user_id = r.user_id returning * into r;
  perform public.econ_log('sell', paid, jsonb_build_object('boat', p_boat, 'lines', lines));
  return public.econ_out(r, jsonb_build_object('paid', paid, 'sold', sold, 'lines', lines));
end $$;

/** Fuel used at sea: the tank only ever goes down this way. */
create or replace function public.econ_burn(p_boat text, p_fuel numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); f numeric;
begin
  perform public.econ_boat(p_boat);
  f := least(coalesce((r.boats #>> array[p_boat, 'fuel'])::numeric, 0), greatest(0, p_fuel));
  update public.economy set boats = jsonb_set(boats, array[p_boat, 'fuel'], to_jsonb(round(f, 2))), updated_at = now() where user_id = r.user_id returning * into r;
  return public.econ_out(r);
end $$;

/** Refuel at the Boathouse (moored): litres, paid for at the fuel price (rounded up). */
create or replace function public.econ_refuel(p_boat text, p_litres numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); cap numeric := (public.econ_boat(p_boat) ->> 'fuel')::numeric; f numeric; l numeric; cost int;
begin
  if not public.econ_docked() then raise exception 'not_docked' using errcode = 'P0001'; end if;
  f := coalesce((r.boats #>> array[p_boat, 'fuel'])::numeric, 0); l := least(greatest(0, p_litres), cap - f);
  if l <= 0 then raise exception 'tank_full' using errcode = 'P0001'; end if;
  cost := ceil(l * (public.econ_cfg() ->> 'fuelPrice')::numeric);
  if r.coins < cost then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - cost, boats = jsonb_set(boats, array[p_boat, 'fuel'], to_jsonb(round(f + l, 2))), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('refuel', -cost, jsonb_build_object('boat', p_boat, 'litres', round(l, 2)));
  return public.econ_out(r, jsonb_build_object('paid', cost, 'litres', round(l, 2)));
end $$;

/** Pay for something (a sea-plane fare). */
create or replace function public.econ_spend(p_amount int, p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row();
begin
  if p_amount is null or p_amount < 1 or p_amount > 100000 then raise exception 'bad_amount' using errcode = 'P0001'; end if;
  if r.coins < p_amount then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - p_amount, updated_at = now() where user_id = r.user_id returning * into r;
  perform public.econ_log('spend', -p_amount, jsonb_build_object('for', left(coalesce(p_reason, ''), 60)));
  return public.econ_out(r);
end $$;

/** A one-off reward (the first voyage's steps): paid once. */
create or replace function public.econ_reward(p_key text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); amt int := (public.econ_cfg() -> 'rewards' ->> p_key)::int;
begin
  if amt is null then raise exception 'no_such_reward' using errcode = 'P0001'; end if;
  if r.rewards ? p_key then return public.econ_out(r, jsonb_build_object('paid', 0)); end if;
  update public.economy set coins = coins + amt, rewards = rewards || jsonb_build_object(p_key, now()), updated_at = now() where user_id = r.user_id returning * into r;
  perform public.econ_log('reward', amt, jsonb_build_object('key', p_key));
  return public.econ_out(r, jsonb_build_object('paid', amt));
end $$;

/** Switch boats. */
create or replace function public.econ_set_active(p_boat text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row();
begin perform public.econ_boat(p_boat); update public.economy set active = p_boat, updated_at = now() where user_id = r.user_id returning * into r; return public.econ_out(r); end $$;

-- ---------- NOS ----------
/** Buy NOS for a boat (a permanent upgrade, delivered full). */
create or replace function public.econ_nos_buy(p_boat text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); n jsonb := public.econ_cfg() -> 'nos'; price int := (n ->> 'price')::int;
begin
  perform public.econ_boat(p_boat);
  if (r.boats #>> array[p_boat, 'nos', 'owned'])::boolean then raise exception 'already_owned' using errcode = 'P0001'; end if;
  if r.coins < price then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - price, boats = jsonb_set(boats, array[p_boat, 'nos'], jsonb_build_object('owned', true, 'charge', (n ->> 'capacity')::numeric)), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('nos_buy', -price, jsonb_build_object('boat', p_boat));
  return public.econ_out(r, jsonb_build_object('paid', price));
end $$;

/** Refill NOS at the Boathouse (moored): seconds of boost, at the refill price per second (rounded up). */
create or replace function public.econ_nos_refill(p_boat text, p_seconds numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); n jsonb := public.econ_cfg() -> 'nos'; ch numeric; extra numeric; cost int;
begin
  perform public.econ_boat(p_boat);
  if not coalesce((r.boats #>> array[p_boat, 'nos', 'owned'])::boolean, false) then raise exception 'no_nos' using errcode = 'P0001'; end if;
  if not public.econ_docked() then raise exception 'not_docked' using errcode = 'P0001'; end if;
  ch := coalesce((r.boats #>> array[p_boat, 'nos', 'charge'])::numeric, 0); extra := least(greatest(0, p_seconds), (n ->> 'capacity')::numeric - ch);
  if extra <= 0 then raise exception 'nos_full' using errcode = 'P0001'; end if;
  cost := ceil(extra * (n ->> 'refillPerSec')::numeric);
  if r.coins < cost then raise exception 'not_enough_coins' using errcode = 'P0001'; end if;
  update public.economy set coins = coins - cost, boats = jsonb_set(boats, array[p_boat, 'nos', 'charge'], to_jsonb(round(ch + extra, 2))), updated_at = now()
    where user_id = r.user_id returning * into r;
  perform public.econ_log('nos_refill', -cost, jsonb_build_object('boat', p_boat, 'seconds', round(extra, 2)));
  return public.econ_out(r, jsonb_build_object('paid', cost));
end $$;

/** Fire NOS: a boost of up to `burst` seconds from the charge, once the last one has cooled down. Returns { boost: seconds }. */
create or replace function public.econ_nos_fire(p_boat text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.economy := public.econ_row(); n jsonb := public.econ_cfg() -> 'nos'; ch numeric; dur numeric;
begin
  perform public.econ_boat(p_boat);
  if not coalesce((r.boats #>> array[p_boat, 'nos', 'owned'])::boolean, false) then raise exception 'no_nos' using errcode = 'P0001'; end if;
  if r.boost_ready is not null and r.boost_ready > now() then raise exception 'nos_cooling' using errcode = 'P0001'; end if;
  ch := coalesce((r.boats #>> array[p_boat, 'nos', 'charge'])::numeric, 0);
  if ch <= 0.05 then raise exception 'nos_empty' using errcode = 'P0001'; end if;
  dur := least((n ->> 'burst')::numeric, ch);
  update public.economy set boats = jsonb_set(boats, array[p_boat, 'nos', 'charge'], to_jsonb(round(ch - dur, 2))),
    boost_until = now() + make_interval(secs => dur::double precision), boost_ready = now() + make_interval(secs => (dur + (n ->> 'cooldown')::numeric)::double precision), updated_at = now()
    where user_id = r.user_id returning * into r;
  return public.econ_out(r, jsonb_build_object('boost', dur));
end $$;

-- only signed-in captains, only through these
revoke execute on function public.econ_row() from public, anon, authenticated;
revoke execute on function public.econ_log(text, int, jsonb) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['econ_get()', 'econ_catch(text, text)', 'econ_release(text)', 'econ_sell(text, jsonb, text)', 'econ_burn(text, numeric)', 'econ_refuel(text, numeric)',
    'econ_spend(int, text)', 'econ_reward(text)', 'econ_set_active(text)', 'econ_nos_buy(text)', 'econ_nos_refill(text, numeric)', 'econ_nos_fire(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;
