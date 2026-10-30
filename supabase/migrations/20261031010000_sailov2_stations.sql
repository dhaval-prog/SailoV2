-- A Paradise Station in every major neighbourhood (src/stations.js). The server keeps every station of a chart: the
-- safe harbour (combat_safe) and the planks' keep-out (plank_at) already look for any station near a point.
-- - Pune's stations ship with the game, so they're written here and the chart is locked: nobody can add one.
-- - Other cities find their neighbourhoods on the live map; captains' games send them (chart_stations_add), and the
--   server keeps those spaced as the game does (1 km apart at least), up to 80 a chart.

alter table public.chart_station add column id text not null default 'home';
alter table public.chart_station drop constraint chart_station_pkey;
alter table public.chart_station add primary key (chart, id);

create table public.chart_station_locked (chart text primary key);
alter table public.chart_station_locked enable row level security;
revoke all on public.chart_station_locked from anon, authenticated;
insert into public.chart_station_locked (chart) values ('pune');

insert into public.chart_station (chart, id, x, z) values
('pune', 'hadapsar', 7093.8455, 6098.8482),
('pune', 'kharadi', 8677.2931, 1383.5863),
('pune', 'viman-nagar', 5858.7563, -431.6789),
('pune', 'kalyani-nagar', 4697.5614, 1959.1581),
('pune', 'yerawada', 2871.3184, 1217.5559),
('pune', 'lohegaon', 7516.0982, -3874.0415),
('pune', 'wagholi', 12657.0249, -1859.5399),
('pune', 'shivajinagar', -1192.8639, 3674.8051),
('pune', 'deccan-gymkhana', -1836.7993, 5235.4904),
('pune', 'camp', 2026.8130, 5423.6581),
('pune', 'pune-station', 1636.2292, 3918.3163),
('pune', 'koregaon-park', 3715.8238, 3077.0958),
('pune', 'swargate', 506.7032, 6884.7252),
('pune', 'kothrud', -5394.2783, 6264.8786),
('pune', 'warje', -6207.1148, 8744.2651),
('pune', 'baner', -7600.5487, 553.4345),
('pune', 'aundh', -5415.3910, 664.1214),
('pune', 'wakad', -10218.5155, -3874.0415),
('pune', 'hinjewadi', -12657.0249, -3021.7524),
('pune', 'pimple-saudagar', -6418.2412, -3874.0415),
('pune', 'katraj', 675.6043, 12297.3146),
('pune', 'kondhwa', 3293.5711, 9629.7603),
('pune', 'wanowrie', 4349.2029, 7858.7699),
('pune', 'bibwewadi', 654.4917, 9851.1341),
('pune', 'sinhagad-road', -3568.0354, 9297.6996),
('pune', 'undri', 6143.7769, 11622.1245),
('pune', 'khadki', -1351.2087, 0.0000),
('pune', 'pimpri', -6112.1079, -7072.8929),
('pune', 'chinchwad', -7262.7466, -8854.9520),
('pune', 'nigdi', -10112.9524, -9629.7603),
('pune', 'bhosari', -1140.0823, -7305.3354),
('pune', 'moshi', -928.9560, -12064.8722)
on conflict do nothing;

/** More stations for a chart ([{ id, x, z }]): those 1 km or more from every other are kept (not on a locked chart). */
create or replace function public.chart_stations_add(p_chart text, p_list jsonb) returns int language plpgsql security definer set search_path = public as $$
declare e jsonb; px double precision; pz double precision; sid text; n int := 0;
begin
  if auth.uid() is null or jsonb_typeof(p_list) <> 'array' or char_length(p_chart) not between 1 and 80 then return 0; end if;
  if exists (select 1 from public.chart_station_locked where chart = p_chart) then return 0; end if;
  for e in select * from jsonb_array_elements(p_list) limit 80 loop
    sid := left(coalesce(e ->> 'id', ''), 60); px := (e ->> 'x')::double precision; pz := (e ->> 'z')::double precision;
    if sid = '' or sid = 'home' or px is null or pz is null or abs(px) > 20000 or abs(pz) > 20000 then continue; end if;
    if (select count(*) from public.chart_station where chart = p_chart) >= 80 then exit; end if;
    if exists (select 1 from public.chart_station s where s.chart = p_chart and (s.id = sid or sqrt(power(s.x - px, 2) + power(s.z - pz, 2)) < 1000)) then continue; end if;
    insert into public.chart_station (chart, id, x, z) values (p_chart, sid, px, pz) on conflict do nothing; n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.chart_stations_add(text, jsonb) from public, anon;
grant execute on function public.chart_stations_add(text, jsonb) to authenticated;
