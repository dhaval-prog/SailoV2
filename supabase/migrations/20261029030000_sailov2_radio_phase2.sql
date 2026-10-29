-- Marine radio, phase 2 (src/radio-net.js): SOS requests, saved messages (voice, text, invites),
-- blocks and reports. All rows are private to the captains involved (RLS); limits are enforced here.

-- ---------- blocks: a captain who blocks you can't message you ----------
create table public.radio_blocks (
  blocker uuid not null default auth.uid() references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.radio_blocks enable row level security;
create policy "radio blocks: own" on public.radio_blocks for all to authenticated using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

-- ---------- saved messages: voice clips (base64, at most 15 s), texts and invites; kept 7 days ----------
create table public.radio_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  sender_name text not null check (char_length(sender_name) between 1 and 18),
  recipient uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('voice', 'text', 'invite')),
  body text check (char_length(body) <= 200),
  clip text check (char_length(clip) <= 400000),
  mime text check (char_length(mime) <= 60),
  dur real check (dur >= 0 and dur <= 16),
  chart text check (char_length(chart) <= 80),
  x real, z real,
  created_at timestamptz not null default now(),
  heard_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  check (sender <> recipient),
  check ((kind = 'voice' and clip is not null) or (kind = 'text' and body is not null) or kind = 'invite')
);
create index radio_messages_recipient on public.radio_messages (recipient, created_at desc);
create index radio_messages_sender on public.radio_messages (sender, created_at desc);
alter table public.radio_messages enable row level security;
-- (blocks are checked in radio_guard: the sender can't see the recipient's blocks under RLS)
create policy "radio messages: send" on public.radio_messages for insert to authenticated with check (sender = (select auth.uid()));
create policy "radio messages: read own" on public.radio_messages for select to authenticated using (recipient = (select auth.uid()) or sender = (select auth.uid()));
create policy "radio messages: mark heard" on public.radio_messages for update to authenticated using (recipient = (select auth.uid())) with check (recipient = (select auth.uid()));
create policy "radio messages: delete own" on public.radio_messages for delete to authenticated using (recipient = (select auth.uid()) or sender = (select auth.uid()));
revoke update on public.radio_messages from authenticated, anon;
grant update (heard_at) on public.radio_messages to authenticated;

-- ---------- SOS: in-game help requests; any signed-in captain can see the active ones ----------
create table public.radio_sos (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  sender_name text not null check (char_length(sender_name) between 1 and 18),
  chart text not null check (char_length(chart) <= 80),
  x real not null, z real not null,
  place text check (char_length(place) <= 60),
  clip text check (char_length(clip) <= 400000),
  mime text check (char_length(mime) <= 60),
  dur real check (dur >= 0 and dur <= 16),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index radio_sos_chart on public.radio_sos (chart, expires_at desc);
alter table public.radio_sos enable row level security;
create policy "radio sos: send" on public.radio_sos for insert to authenticated with check (sender = (select auth.uid()));
create policy "radio sos: see active and own" on public.radio_sos for select to authenticated
  using ((resolved_at is null and expires_at > now()) or sender = (select auth.uid()));
create policy "radio sos: resolve own" on public.radio_sos for update to authenticated using (sender = (select auth.uid())) with check (sender = (select auth.uid()));
revoke update on public.radio_sos from authenticated, anon;
grant update (resolved_at) on public.radio_sos to authenticated;

-- ---------- reports ----------
create table public.radio_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  reported uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'fake_sos', 'other')),
  context text check (char_length(context) <= 300),
  message_id uuid, sos_id uuid,
  created_at timestamptz not null default now(),
  check (reporter <> reported)
);
alter table public.radio_reports enable row level security;
create policy "radio reports: file" on public.radio_reports for insert to authenticated with check (reporter = (select auth.uid()));
create policy "radio reports: see own" on public.radio_reports for select to authenticated using (reporter = (select auth.uid()));

-- ---------- limits and housekeeping (server-side, so a modded client can't skip them) ----------
create or replace function public.radio_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  new.created_at := now();
  if tg_table_name = 'radio_messages' then
    new.sender := auth.uid(); new.heard_at := null; new.expires_at := now() + interval '7 days';
    if exists (select 1 from public.radio_blocks b where b.blocker = new.recipient and b.blocked = new.sender) then
      raise exception 'blocked: this captain is not taking your messages' using errcode = 'P0001'; end if;
    select count(*) into n from public.radio_messages where sender = new.sender and created_at > now() - interval '1 hour';
    if n >= 30 then raise exception 'rate_limited: 30 messages an hour' using errcode = 'P0001'; end if;
    delete from public.radio_messages where expires_at < now();
  elsif tg_table_name = 'radio_sos' then
    new.sender := auth.uid(); new.resolved_at := null; new.expires_at := now() + interval '15 minutes';
    if exists (select 1 from public.radio_sos where sender = new.sender and created_at > now() - interval '10 minutes') then
      raise exception 'rate_limited: one SOS every 10 minutes' using errcode = 'P0001'; end if;
    select count(*) into n from public.radio_sos where sender = new.sender and created_at > now() - interval '1 day';
    if n >= 5 then raise exception 'rate_limited: 5 SOS a day' using errcode = 'P0001'; end if;
    delete from public.radio_sos where expires_at < now() - interval '1 day';
  elsif tg_table_name = 'radio_reports' then
    new.reporter := auth.uid();
    select count(*) into n from public.radio_reports where reporter = new.reporter and created_at > now() - interval '1 day';
    if n >= 20 then raise exception 'rate_limited: 20 reports a day' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.radio_guard() from public, anon, authenticated;
create trigger radio_messages_guard before insert on public.radio_messages for each row execute function public.radio_guard();
create trigger radio_sos_guard before insert on public.radio_sos for each row execute function public.radio_guard();
create trigger radio_reports_guard before insert on public.radio_reports for each row execute function public.radio_guard();
