-- SailoV2: positions become latitude/longitude plus the chart (the city ocean) they are in,
-- so a player resumes in the right city on any device. Additive: the original functions keep working.
-- Also widens the x/z limits: the Pune ocean is now 20 mi a side (16.1 km from centre to edge).

alter table public.boat_positions drop constraint boat_positions_x_check, drop constraint boat_positions_z_check;
alter table public.boat_positions
  add constraint boat_positions_x_check check (abs(x) <= 20000),
  add constraint boat_positions_z_check check (abs(z) <= 20000),
  add column chart jsonb check (chart is null or (jsonb_typeof(chart) = 'object' and octet_length(chart::text) <= 1024)),
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lng double precision check (lng is null or lng between -180 and 180);

create function public.save_boat_position_v2(p_device uuid, p_chart jsonb, p_lat double precision, p_lng double precision,
  p_x double precision, p_z double precision, p_heading double precision)
returns void language sql security definer set search_path = '' as $$
  insert into public.boat_positions (device_id, chart, lat, lng, x, z, heading, updated_at)
  values (p_device, p_chart, p_lat, p_lng, p_x, p_z, p_heading, now())
  on conflict (device_id) do update set chart = excluded.chart, lat = excluded.lat, lng = excluded.lng,
    x = excluded.x, z = excluded.z, heading = excluded.heading, updated_at = now();
$$;

create function public.get_boat_position_v2(p_device uuid)
returns table (chart jsonb, lat double precision, lng double precision, x double precision, z double precision, heading double precision, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.chart, b.lat, b.lng, b.x, b.z, b.heading, b.updated_at from public.boat_positions b where b.device_id = p_device;
$$;

revoke all on function public.save_boat_position_v2(uuid, jsonb, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.get_boat_position_v2(uuid) from public;
grant execute on function public.save_boat_position_v2(uuid, jsonb, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.get_boat_position_v2(uuid) to anon, authenticated;
