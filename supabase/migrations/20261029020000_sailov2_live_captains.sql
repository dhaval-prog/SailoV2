-- Live captains (src/online.js): signed-in captains share their boats on a private Realtime channel per chart
-- ("sailo:<chart id>"): presence (who's on the water) and broadcasts (positions, waves, catches).
-- Only signed-in captains may listen or send, and only on sailo: topics. Nothing is stored.
create policy "sailo captains read live channels" on realtime.messages for select to authenticated
  using (realtime.topic() like 'sailo:%' and extension in ('broadcast', 'presence'));
create policy "sailo captains send on live channels" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'sailo:%' and extension in ('broadcast', 'presence'));
