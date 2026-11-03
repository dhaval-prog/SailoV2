-- Remove MySpace's Games, Split / payments and Budget cards from Sailo's project: their tables (with all their data),
-- the functions that served them, and their notifications. Pocket (rooms, item-photos), chats, friends and Throw stay.
-- The two account-deletion functions are rewritten without the removed tables.

-- functions first (several are used by the tables' own policies)
drop function if exists
  private.is_card_member, private.is_card_owner, private.is_game_player, private.is_split_member, private.is_split_owner,
  private.is_trivia_player, private.maybe_transfer_trivia_host, private.pick_npat_letter, private.reveal_trivia_question,
  private.shares_card_with, private.shares_split_group, private.shares_split_with,
  public.add_split_member, public.advance_trivia_question, public.award_game_points, public.cancel_upi_payment,
  public.confirm_upi_payment, public.create_game_room, public.create_trivia_game, public.create_upi_payment,
  public.heartbeat_trivia_presence, public.join_budget_card, public.join_game_room, public.join_split_group,
  public.join_trivia_game, public.leave_game_room, public.leave_trivia_game, public.lock_expired_round,
  public.mark_upi_payment_sent, public.notify_card_expense_activity, public.notify_split_expense_activity,
  public.set_ready, public.start_round, public.submit_round_answers, public.submit_trivia_answer,
  public.update_trivia_game_settings, public.verify_own_upi_id, public.remind_upi_setup
  cascade;

-- Games
drop table if exists
  public.game_answers, public.game_answer_bank, public.game_rounds, public.game_players, public.game_rooms,
  public.game_point_transactions, public.player_game_stats,
  public.trivia_answers, public.trivia_correct_answers, public.trivia_questions, public.trivia_players, public.trivia_games
  cascade;

-- Split and payments
drop table if exists
  public.payment_attempts, public.user_payment_profiles,
  public.split_chat_messages, public.split_expense_shares, public.split_expenses, public.split_settlements,
  public.split_locations, public.split_planned_spots, public.split_members, public.split_groups
  cascade;

-- Budget cards
drop table if exists public.card_expenses, public.card_topups, public.card_members, public.budget_cards cascade;

-- their notifications
delete from public.notifications where category in ('payment_activity', 'split_activity', 'game_complete') or entity_type = 'card';

-- account deletion, without the removed tables
create or replace function public.delete_own_account() returns void
  language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

create or replace function public.delete_own_data() returns void
  language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.rooms where user_id = uid;
end;
$$;
