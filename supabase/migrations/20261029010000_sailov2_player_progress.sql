-- SailoV2: game progress per captain account (coins, boats and their fuel / hold, the fish collection,
-- the current boat, positions per city, visited cities, settings and boat colours), as one JSON object.
-- Each signed-in captain can read and write only their own row (row-level security on auth.uid()).
create table public.player_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 262144),
  updated_at timestamptz not null default now()
);
alter table public.player_progress enable row level security;
revoke all on table public.player_progress from anon, authenticated;
grant select, insert, update on table public.player_progress to authenticated;

create policy "captains read their own progress" on public.player_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "captains save their own progress" on public.player_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "captains update their own progress" on public.player_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- the server's clock stamps every save (the client can't backdate or future-date one)
create function public.player_progress_stamp() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger player_progress_stamp before insert or update on public.player_progress
  for each row execute function public.player_progress_stamp();
