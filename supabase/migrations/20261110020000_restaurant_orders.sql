-- Restaurant fish orders (island-visits.js): a restaurant island wants certain fish today ("Golden Dragon needs 2
-- Pomfret, pays 1.5x"). Delivering takes the fish from the boat's hold and pays the market price times the order's
-- bonus. Each restaurant's order can be filled once a day per captain, and at most 12 orders a day in all; the bonus
-- is capped at 1.8x and an order at 3 fish, whatever the app asks for.

create table if not exists public.econ_orders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shop text not null,
  day date not null,
  fish text not null,
  n int not null,
  paid int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop, day)
);
alter table public.econ_orders enable row level security;
drop policy if exists "read own orders" on public.econ_orders;
create policy "read own orders" on public.econ_orders for select to authenticated using (user_id = auth.uid());

create or replace function public.econ_order(p_boat text, p_shop text, p_fish text, p_n int, p_mult numeric, p_tz text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.economy := public.econ_row(); d date; have int; price int; paid int; nb jsonb; today int;
begin
  perform public.econ_boat(p_boat);
  if p_n is null or p_n < 1 or p_n > 3 or p_mult is null or p_mult < 1 or p_mult > 1.8
     or coalesce(length(p_shop), 0) not between 1 and 80 then raise exception 'bad_order' using errcode = 'P0001'; end if;
  d := (now() at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date;
  if exists (select 1 from public.econ_orders where user_id = r.user_id and shop = p_shop and day = d) then raise exception 'order_done' using errcode = 'P0001'; end if;
  select count(*) into today from public.econ_orders where user_id = r.user_id and day = d;
  if today >= 12 then raise exception 'orders_done_today' using errcode = 'P0001'; end if;
  nb := r.boats; have := coalesce((nb #>> array[p_boat, 'hold', p_fish])::int, 0);
  if have < p_n then raise exception 'not_in_hold' using errcode = 'P0001'; end if;
  price := public.mkt_price(p_fish, p_tz); if price is null then raise exception 'no_such_fish' using errcode = 'P0001'; end if;
  paid := ceil(p_n * price * p_mult)::int;
  nb := case when have - p_n > 0 then jsonb_set(nb, array[p_boat, 'hold', p_fish], to_jsonb(have - p_n)) else nb #- array[p_boat, 'hold', p_fish] end;
  update public.economy set boats = nb, coins = coins + paid, updated_at = now() where user_id = r.user_id returning * into r;
  insert into public.econ_orders (user_id, shop, day, fish, n, paid) values (r.user_id, p_shop, d, p_fish, p_n, paid);
  perform public.econ_log('order', paid, jsonb_build_object('boat', p_boat, 'shop', p_shop, 'fish', p_fish, 'n', p_n));
  return public.econ_out(r, jsonb_build_object('paid', paid));
end $$;
revoke all on function public.econ_order(text, text, text, int, numeric, text) from public, anon;
grant execute on function public.econ_order(text, text, text, int, numeric, text) to authenticated;
