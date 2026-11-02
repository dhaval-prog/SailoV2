-- Remove naval combat (cannons, hulls, shots), NOS and wooden planks (floating planks, wrecks, salvage, plank sales).
-- The game no longer has them (src/combat.js, src/nos.js and src/salvage.js are gone). The economy keeps coins, each
-- boat's fuel and fish hold, and the one-off rewards. chart_station stays: it's the list of stations (src/stations.js).

-- ---------- the economy, without NOS, cannons or planks ----------
create or replace function public.econ_cfg() returns jsonb language sql immutable as $$ select '{
  "fuelPrice": 2, "catchGap": 3, "release": 0.2,
  "boats": { "tug": { "fuel": 120, "hold": 30 }, "sail": { "fuel": 60, "hold": 16 }, "yacht": { "fuel": 240, "hold": 45 }, "dinghy": { "fuel": 20, "hold": 8 } },
  "rewards": { "voyage1": 10, "voyage2": 15, "voyage3": 25 },
  "market": { "period": 1800, "swing": 0.22, "daily": 0.12, "min": 0.6, "max": 1.6 }
}'::jsonb $$;

-- the boats, each with its tank (clamped to its size) and hold
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
      'hold', hold));
  end loop;
  return out;
end $$;

create or replace function public.econ_out(r public.economy, extra jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('coins', r.coins, 'active', r.active, 'boats', r.boats, 'rewards', r.rewards, 'now', now()) || extra $$;

-- ---------- the functions that go ----------
drop function if exists public.econ_nos_buy(text);
drop function if exists public.econ_nos_refill(text, numeric);
drop function if exists public.econ_nos_fire(text);
drop function if exists public.econ_cannon_buy(text);
drop function if exists public.econ_balls_buy(text, int);
drop function if exists public.combat_here(text, double precision, double precision, double precision, double precision);
drop function if exists public.combat_me();
drop function if exists public.combat_fire(text, text, double precision, double precision, double precision, double precision);
drop function if exists public.combat_hit(bigint, text, text, double precision, double precision);
drop function if exists public.combat_repair();
drop function if exists public.combat_respawn();
drop function if exists public.combat_npcs(text);
drop function if exists public.combat_out(public.combat_hull, jsonb);
drop function if exists public.combat_hull_row(uuid);
drop function if exists public.combat_safe(text, double precision, double precision);
drop function if exists public.combat_cfg();
drop function if exists public.salvage_wrecks(text);
drop function if exists public.salvage_take(bigint, text, double precision, double precision);
drop function if exists public.salvage_wreck(text, double precision, double precision, uuid, text, uuid);
drop function if exists public.salvage_take_loot(uuid);
drop function if exists public.planks_taken(text);
drop function if exists public.plank_pick(text, int, int, bigint);
drop function if exists public.plank_at(text, int, int, bigint);
drop function if exists public.econ_sell_planks(int);
drop function if exists public.salvage_cfg();

-- ---------- the tables and columns that go ----------
drop table if exists public.combat_shots;
drop table if exists public.combat_pos;
drop table if exists public.combat_hull;
drop table if exists public.npc_hull;
drop table if exists public.wrecks;
drop table if exists public.plank_picks;
drop table if exists public.npc_roster;

-- each boat loses its NOS and cannon; the captain loses their planks and the boost timers
update public.economy set boats = public.econ_boats(boats);
alter table public.economy drop column if exists planks;
alter table public.economy drop column if exists boost_until;
alter table public.economy drop column if exists boost_ready;
comment on column public.economy.boats is '{ tug: { fuel, hold: { fishId: n } }, ... }';
