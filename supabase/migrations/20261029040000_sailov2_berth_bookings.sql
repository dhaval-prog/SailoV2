-- Berth booking at Paradise Station (src/berths.js): each berth on each chart can be held by one captain at a
-- time (the primary key makes that atomic). A booking moves reserved -> occupied -> releasing -> freed, and
-- expires if its captain goes quiet: 3 min to sail in once reserved, renewed every minute while moored (3 min),
-- 90 s to clear the pier when casting off. An expired booking is cleared by the next captain who wants the berth.
create table public.berth_bookings (
  chart text not null check (char_length(chart) between 1 and 80),
  berth smallint not null check (berth between 0 and 7),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  captain text not null check (char_length(captain) between 1 and 18),
  state text not null default 'reserved' check (state in ('reserved', 'occupied', 'releasing')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (chart, berth)
);
create index berth_bookings_user on public.berth_bookings (user_id);
alter table public.berth_bookings enable row level security;
-- every signed-in captain can see who holds which berth; changes only go through the functions below
create policy "berth bookings: see" on public.berth_bookings for select to authenticated using (true);
revoke insert, update, delete on public.berth_bookings from anon, authenticated;

/** Book a berth: frees an expired holder, drops your other booking, then claims it (or fails: berth_taken). */
create or replace function public.book_berth(p_chart text, p_berth int, p_captain text)
returns public.berth_bookings language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.berth_bookings;
begin
  if me is null then raise exception 'signed_out' using errcode = 'P0001'; end if;
  if p_berth < 0 or p_berth > 7 then raise exception 'no_such_berth' using errcode = 'P0001'; end if;
  delete from public.berth_bookings where chart = p_chart and berth = p_berth and expires_at < now();
  delete from public.berth_bookings where user_id = me;
  insert into public.berth_bookings (chart, berth, user_id, captain, state, expires_at)
    values (p_chart, p_berth, me, left(coalesce(nullif(trim(p_captain), ''), 'Captain'), 18), 'reserved', now() + interval '3 minutes')
    on conflict (chart, berth) do nothing returning * into r;
  if r.user_id is null then raise exception 'berth_taken' using errcode = 'P0001'; end if;
  return r;
end $$;

/** Move your booking on: 'reserved' / 'occupied' (sailing in / moored: call again every minute), 'releasing' (casting off) or 'free'. */
create or replace function public.berth_state(p_chart text, p_berth int, p_state text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'signed_out' using errcode = 'P0001'; end if;
  if p_state = 'free' then delete from public.berth_bookings where chart = p_chart and berth = p_berth and user_id = me; return; end if;
  if p_state not in ('reserved', 'occupied', 'releasing') then raise exception 'bad_state' using errcode = 'P0001'; end if;
  update public.berth_bookings set state = p_state, expires_at = now() + case when p_state = 'releasing' then interval '90 seconds' else interval '3 minutes' end
    where chart = p_chart and berth = p_berth and user_id = me;
  if not found then raise exception 'not_your_berth' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.book_berth(text, int, text), public.berth_state(text, int, text) from public, anon;
grant execute on function public.book_berth(text, int, text), public.berth_state(text, int, text) to authenticated;
