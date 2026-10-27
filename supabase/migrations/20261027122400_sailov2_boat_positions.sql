-- SailoV2: last known boat position per browser (keyed by a random device id kept in localStorage).
-- Already applied to the Sailo project; kept here for reference.
create table public.boat_positions (
  device_id uuid primary key,
  x double precision not null check (abs(x) <= 11400),
  z double precision not null check (abs(z) <= 11400),
  heading double precision not null default 0 check (abs(heading) < 1e6),
  updated_at timestamptz not null default now()
);
alter table public.boat_positions enable row level security;
-- no policies: the table is only reachable through the two functions below
revoke all on table public.boat_positions from anon, authenticated;

create function public.save_boat_position(p_device uuid, p_x double precision, p_z double precision, p_heading double precision)
returns void language sql security definer set search_path = '' as $$
  insert into public.boat_positions (device_id, x, z, heading, updated_at)
  values (p_device, p_x, p_z, p_heading, now())
  on conflict (device_id) do update set x = excluded.x, z = excluded.z, heading = excluded.heading, updated_at = now();
$$;

create function public.get_boat_position(p_device uuid)
returns table (x double precision, z double precision, heading double precision, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.x, b.z, b.heading, b.updated_at from public.boat_positions b where b.device_id = p_device;
$$;

revoke all on function public.save_boat_position(uuid, double precision, double precision, double precision) from public;
revoke all on function public.get_boat_position(uuid) from public;
grant execute on function public.save_boat_position(uuid, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.get_boat_position(uuid) to anon, authenticated;
