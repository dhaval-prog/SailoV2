-- MySpace (formerly its own Supabase project, fdjeafihwwoeqdcnqhjd) moved into Sailo's project.
-- Consolidated from MySpace's 118 migrations plus changes made outside them, checked object by object against the
-- live MySpace database. Applied on 2026-11-02; data, accounts and files were copied separately.
-- profiles is shared with Sailo (MySpace's fields added); phone and date of birth live in profile_private (owner only).

--
-- PostgreSQL database dump
--



-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)




SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, extensions', true);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS private;


--
-- Name: build_shuffled_deck(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.build_shuffled_deck() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
  with cards as (
    select suit, rank
    from unnest(array['ember','tide','moss','solar']) as suit,
         unnest(array['0','1','1','2','2','3','3','4','4','5','5','6','6','7','7','8','8','9','9']) as rank
    union all
    select suit, rank
    from unnest(array['ember','tide','moss','solar']) as suit,
         unnest(array['block','block','flip','flip','surge2','surge2']) as rank
    union all
    select null::text, rank
    from unnest(array['prism','prism','prism','prism','prism4','prism4','prism4','prism4']) as rank
  )
  select jsonb_agg(jsonb_build_object('suit', suit, 'rank', rank) order by random()) from cards;
$$;


--
-- Name: ensure_draw_pile(uuid, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.ensure_draw_pile(p_game_id uuid, p_needed integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_deck record;
  v_top jsonb;
  v_reshuffled jsonb;
begin
  select * into v_deck from cards_deck_state where game_id = p_game_id for update;
  if jsonb_array_length(v_deck.draw_pile) >= p_needed then return; end if;

  v_top := v_deck.discard_pile -> (jsonb_array_length(v_deck.discard_pile) - 1);
  select jsonb_agg(elem order by random()) into v_reshuffled
    from jsonb_array_elements(v_deck.discard_pile) with ordinality as t(elem, i)
    where i < jsonb_array_length(v_deck.discard_pile);

  update cards_deck_state set
    draw_pile = v_deck.draw_pile || coalesce(v_reshuffled, '[]'::jsonb),
    discard_pile = jsonb_build_array(v_top)
  where game_id = p_game_id;
end;
$$;


--
-- Name: finalize_rename_poll(uuid, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.finalize_rename_poll(p_poll_id uuid, p_force boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_poll record;
  v_yes_id uuid;
  v_no_id uuid;
  v_member_count int;
  v_majority int;
  v_yes_votes int;
  v_no_votes int;
  v_names text;
begin
  select * into v_poll from group_polls where id = p_poll_id and purpose = 'rename' and resolved = false for update;
  if not found then
    return;
  end if;

  select id into v_yes_id from group_poll_options where poll_id = p_poll_id order by position asc limit 1;
  select id into v_no_id from group_poll_options where poll_id = p_poll_id order by position desc limit 1;

  select count(*) into v_member_count from chat_group_members where group_id = v_poll.group_id;
  v_majority := (v_member_count / 2) + 1;

  select count(*) into v_yes_votes from group_poll_votes where poll_id = p_poll_id and option_id = v_yes_id;
  select count(*) into v_no_votes from group_poll_votes where poll_id = p_poll_id and option_id = v_no_id;

  if v_yes_votes >= v_majority then
    select string_agg(coalesce(pr.full_name, 'Someone'), ', ') into v_names
      from group_poll_votes gv join profiles pr on pr.id = gv.user_id where gv.poll_id = p_poll_id and gv.option_id = v_yes_id;
    update chat_groups set name = v_poll.proposed_name where id = v_poll.group_id;
    update group_polls set resolved = true, resolution = 'renamed', resolved_at = now() where id = p_poll_id;
    insert into group_messages (group_id, sender_id, kind, text)
      values (v_poll.group_id, v_poll.created_by, 'system', 'Group renamed to "' || v_poll.proposed_name || '" — agreed by ' || coalesce(v_names, 'a majority'));
  elsif v_no_votes >= v_majority then
    select string_agg(coalesce(pr.full_name, 'Someone'), ', ') into v_names
      from group_poll_votes gv join profiles pr on pr.id = gv.user_id where gv.poll_id = p_poll_id and gv.option_id = v_no_id;
    update group_polls set resolved = true, resolution = 'kept', resolved_at = now() where id = p_poll_id;
    insert into group_messages (group_id, sender_id, kind, text)
      values (v_poll.group_id, v_poll.created_by, 'system', 'Group name kept as "' || v_poll.old_name || '" — ' || coalesce(v_names, 'a majority') || ' disagreed with the rename');
  elsif p_force then
    if v_yes_votes = 0 and v_no_votes = 0 then
      update chat_groups set name = v_poll.proposed_name where id = v_poll.group_id;
      update group_polls set resolved = true, resolution = 'renamed', resolved_at = now() where id = p_poll_id;
      insert into group_messages (group_id, sender_id, kind, text)
        values (v_poll.group_id, v_poll.created_by, 'system', 'Group automatically renamed to "' || v_poll.proposed_name || '" — no one voted within an hour');
    elsif v_yes_votes >= v_no_votes then
      select string_agg(coalesce(pr.full_name, 'Someone'), ', ') into v_names
        from group_poll_votes gv join profiles pr on pr.id = gv.user_id where gv.poll_id = p_poll_id and gv.option_id = v_yes_id;
      update chat_groups set name = v_poll.proposed_name where id = v_poll.group_id;
      update group_polls set resolved = true, resolution = 'renamed', resolved_at = now() where id = p_poll_id;
      insert into group_messages (group_id, sender_id, kind, text)
        values (v_poll.group_id, v_poll.created_by, 'system', 'Group renamed to "' || v_poll.proposed_name || '" — the hour ran out, more people agreed (' || coalesce(v_names, 'some members') || ')');
    else
      select string_agg(coalesce(pr.full_name, 'Someone'), ', ') into v_names
        from group_poll_votes gv join profiles pr on pr.id = gv.user_id where gv.poll_id = p_poll_id and gv.option_id = v_no_id;
      update group_polls set resolved = true, resolution = 'kept', resolved_at = now() where id = p_poll_id;
      insert into group_messages (group_id, sender_id, kind, text)
        values (v_poll.group_id, v_poll.created_by, 'system', 'Group name kept as "' || v_poll.old_name || '" — the hour ran out, more people disagreed (' || coalesce(v_names, 'some members') || ')');
    end if;
  end if;
end;
$$;


--
-- Name: force_draw_player(uuid, uuid, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.force_draw_player(p_game_id uuid, p_player_id uuid, p_count integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_deck record;
  v_drawn jsonb;
  v_hand jsonb;
  v_new_remaining int;
begin
  perform private.ensure_draw_pile(p_game_id, p_count);
  select * into v_deck from cards_deck_state where game_id = p_game_id for update;

  v_drawn := (select coalesce(jsonb_agg(elem), '[]'::jsonb) from jsonb_array_elements(v_deck.draw_pile) with ordinality as t(elem, i) where i <= p_count);
  update cards_deck_state set draw_pile = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb) from jsonb_array_elements(v_deck.draw_pile) with ordinality as t(elem, i) where i > p_count
    ) where game_id = p_game_id;

  select hand into v_hand from cards_hands where player_id = p_player_id for update;
  v_hand := v_hand || v_drawn;
  v_new_remaining := jsonb_array_length(v_hand);
  update cards_hands set hand = v_hand where player_id = p_player_id;
  update cards_players set cards_remaining = v_new_remaining, last_card_announced = (v_new_remaining <> 1) where id = p_player_id;
end;
$$;


--
-- Name: generate_friend_code(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.generate_friend_code() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = v_code);
  end loop;
  return v_code;
end;
$$;


--
-- Name: in_app_pref_enabled(uuid, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.in_app_pref_enabled(p_user_id uuid, p_category text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select (notification_prefs -> p_category ->> 'inApp')::boolean
     from public.user_settings where user_id = p_user_id),
    true
  );
$$;


--
-- Name: is_accepted_friend(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_accepted_friend(p_profile_id uuid, p_viewer uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.friend_connections
    where status = 'accepted'
      and ((requester_id = p_profile_id and addressee_id = p_viewer)
        or (requester_id = p_viewer and addressee_id = p_profile_id))
  );
$$;


--
-- Name: is_card_member(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_card_member(p_card_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.card_members m where m.card_id = p_card_id and m.user_id = p_user_id);
$$;


--
-- Name: is_card_owner(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_card_owner(p_card_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.budget_cards c where c.id = p_card_id and c.owner_id = p_user_id);
$$;


--
-- Name: is_chat_group_member(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_chat_group_member(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.chat_group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;


--
-- Name: is_connection_party(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_connection_party(p_connection_id uuid, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.friend_connections
    where id = p_connection_id and (requester_id = p_user or addressee_id = p_user)
  );
$$;


--
-- Name: is_game_player(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_game_player(p_game_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from game_players
    where game_id = p_game_id and user_id = p_user_id and left_at is null
  );
$$;


--
-- Name: is_split_member(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_split_member(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.split_members m where m.group_id = p_group_id and m.user_id = p_user_id);
$$;


--
-- Name: is_split_owner(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_split_owner(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.split_groups g where g.id = p_group_id and g.owner_id = p_user_id);
$$;


--
-- Name: is_trivia_player(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_trivia_player(p_game_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from trivia_players
    where game_id = p_game_id and user_id = p_user_id and left_at is null
  );
$$;


--
-- Name: maybe_transfer_trivia_host(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.maybe_transfer_trivia_host(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game record;
  v_host_row record;
  v_stale boolean;
  v_candidate record;
begin
  select * into v_game from trivia_games where id = p_game_id for update;
  if v_game.id is null or v_game.status in ('completed', 'cancelled') then return; end if;

  select * into v_host_row from trivia_players
    where game_id = p_game_id and user_id = v_game.host_id
    order by joined_at desc limit 1;

  v_stale := v_host_row.id is null or v_host_row.left_at is not null or v_host_row.last_seen_at < now() - interval '20 seconds';
  if not v_stale then return; end if;

  select * into v_candidate from trivia_players
    where game_id = p_game_id and left_at is null and user_id <> v_game.host_id
      and last_seen_at >= now() - interval '20 seconds'
    order by last_seen_at desc, joined_at asc
    limit 1;

  if v_candidate.id is not null then
    update trivia_games set host_id = v_candidate.user_id where id = p_game_id;
  end if;
end;
$$;


--
-- Name: pick_npat_letter(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.pick_npat_letter(p_game_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  used text[];
  available text[];
begin
  select coalesce(array_agg(letter), array[]::text[]) into used
    from game_rounds where game_id = p_game_id;

  select array_agg(l) into available
    from unnest(array['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']) as l
    where l <> all (used);

  -- Every letter already used in this game (an unusually long game, 26+ rounds) —
  -- allow a repeat rather than fail the round.
  if available is null or array_length(available, 1) = 0 then
    available := array['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  end if;

  return available[floor(random() * array_length(available, 1) + 1)::int];
end;
$$;


--
-- Name: reveal_trivia_question(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reveal_trivia_question(p_question_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_claimed uuid;
  v_question record;
  v_fastest_player_id uuid;
begin
  select * into v_question from trivia_questions where id = p_question_id for update;
  if v_question.id is null then return; end if;

  update trivia_questions set status = 'revealed', reveal_ends_at = now() + interval '6 seconds'
    where id = p_question_id and status = 'active'
    returning id into v_claimed;
  if v_claimed is null then return; end if;

  update trivia_players set unanswered = unanswered + 1
    where game_id = v_question.game_id and left_at is null
    and id not in (select player_id from trivia_answers where question_id = p_question_id);

  select player_id into v_fastest_player_id from trivia_answers
    where question_id = p_question_id and is_correct
    order by response_time_ms asc limit 1;
  if v_fastest_player_id is not null then
    update trivia_players set fastest_answers = fastest_answers + 1 where id = v_fastest_player_id;
  end if;
end;
$$;


--
-- Name: set_friend_code(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_friend_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.friend_code is null then
    new.friend_code := private.generate_friend_code();
  end if;
  return new;
end;
$$;


--
-- Name: shares_card_with(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shares_card_with(p_target_user_id uuid, p_viewer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.budget_cards c
    where (c.owner_id = p_target_user_id or private.is_card_member(c.id, p_target_user_id))
      and (c.owner_id = p_viewer_id or private.is_card_member(c.id, p_viewer_id))
  );
$$;


--
-- Name: shares_chat_group_with(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shares_chat_group_with(p_target_user_id uuid, p_viewer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.chat_group_members m1
    join public.chat_group_members m2 on m1.group_id = m2.group_id
    where m1.user_id = p_target_user_id and m2.user_id = p_viewer_id
  );
$$;


--
-- Name: shares_split_group(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shares_split_group(a uuid, b uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.split_groups g
    where (g.owner_id = a or private.is_split_member(g.id, a))
      and (g.owner_id = b or private.is_split_member(g.id, b))
  );
$$;


--
-- Name: shares_split_with(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shares_split_with(p_target_user_id uuid, p_viewer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.split_groups g
    where (g.owner_id = p_target_user_id or private.is_split_member(g.id, p_target_user_id))
      and (g.owner_id = p_viewer_id or private.is_split_member(g.id, p_viewer_id))
  );
$$;


--
-- Name: sweep_expired_rename_polls(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sweep_expired_rename_polls() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  r record;
begin
  for r in select id from group_polls where purpose = 'rename' and resolved = false and expires_at <= now() loop
    perform private.finalize_rename_poll(r.id, true);
  end loop;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: add_split_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_split_member(p_group_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.split_groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'Only the split owner can add members directly';
  end if;

  if p_user_id = auth.uid() then
    return;
  end if;

  insert into public.split_members (group_id, user_id)
  values (p_group_id, p_user_id)
  on conflict (group_id, user_id) do nothing;
end;
$$;


--
-- Name: advance_trivia_question(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advance_trivia_question(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game record;
  v_question record;
  v_claimed uuid;
  v_max_score int;
  v_top_count int;
  v_outcomes jsonb;
begin
  if not private.is_trivia_player(p_game_id, auth.uid()) then
    raise exception 'not a player in this game';
  end if;

  perform private.maybe_transfer_trivia_host(p_game_id);

  select * into v_game from trivia_games where id = p_game_id for update;
  if v_game.id is null or v_game.status <> 'active' then return; end if;

  select * into v_question from trivia_questions where game_id = p_game_id and question_index = v_game.current_question_index for update;
  if v_question.id is null then return; end if;

  if v_question.status = 'active' then
    if now() >= v_question.ends_at then
      perform private.reveal_trivia_question(v_question.id);
    end if;
    return;
  end if;

  if v_question.status = 'revealed' and now() >= v_question.reveal_ends_at then
    if v_game.current_question_index + 1 < v_game.question_count then
      update trivia_questions set status = 'active', starts_at = now(), ends_at = now() + make_interval(secs => v_game.time_per_question)
        where game_id = p_game_id and question_index = v_game.current_question_index + 1 and status = 'pending'
        returning id into v_claimed;
      if v_claimed is not null then
        update trivia_games set current_question_index = current_question_index + 1 where id = p_game_id;
      end if;
    else
      update trivia_games set status = 'completed', completed_at = now() where id = p_game_id and status = 'active' returning id into v_claimed;
      if v_claimed is not null then
        select max(score) into v_max_score from trivia_players where game_id = p_game_id and left_at is null;
        select count(*) into v_top_count from trivia_players where game_id = p_game_id and left_at is null and score = v_max_score;

        select jsonb_agg(jsonb_build_object(
            'user_id', user_id,
            'result', case
              when score < v_max_score then 'loss'
              when v_top_count > 1 then 'draw'
              else 'win'
            end
          ))
          into v_outcomes
        from trivia_players where game_id = p_game_id and left_at is null;

        if v_outcomes is not null then
          perform award_game_points('TRIVIA', p_game_id, v_outcomes);
        end if;
      end if;
    end if;
  end if;
end;
$$;


--
-- Name: award_game_points(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_game_points(p_game_type text, p_game_id uuid, p_outcomes jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_outcome jsonb;
  v_user_id uuid;
  v_result text;
  v_change int;
  v_prev int;
  v_new int;
  v_txn_id uuid;
begin
  for v_outcome in select * from jsonb_array_elements(p_outcomes) loop
    v_user_id := (v_outcome->>'user_id')::uuid;
    v_result := v_outcome->>'result';
    if v_result not in ('win', 'loss', 'draw') then
      raise exception 'invalid result %', v_result;
    end if;
    v_change := case v_result when 'win' then 1 when 'loss' then -1 else 0 end;

    insert into player_game_stats (user_id) values (v_user_id)
      on conflict (user_id) do nothing;

    select total_points into v_prev from player_game_stats where user_id = v_user_id for update;
    v_new := v_prev + v_change;

    insert into game_point_transactions
        (user_id, game_id, game_type, result, points_change, previous_points, new_points)
      values (v_user_id, p_game_id, p_game_type, v_result, v_change, v_prev, v_new)
      on conflict (game_type, game_id, user_id) do nothing
      returning id into v_txn_id;

    if v_txn_id is not null then
      update player_game_stats set
        total_points = v_new,
        games_played = games_played + 1,
        games_won = games_won + case when v_result = 'win' then 1 else 0 end,
        games_lost = games_lost + case when v_result = 'loss' then 1 else 0 end,
        games_drawn = games_drawn + case when v_result = 'draw' then 1 else 0 end,
        updated_at = now()
      where user_id = v_user_id;
    end if;
  end loop;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: friend_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    user_lo uuid GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) STORED,
    user_hi uuid GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) STORED,
    intro_message text,
    blocked_by uuid,
    CONSTRAINT friend_connections_no_self CHECK ((requester_id <> addressee_id)),
    CONSTRAINT friend_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])))
);


--
-- Name: block_friend_connection(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_friend_connection(p_connection_id uuid) RETURNS public.friend_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.friend_connections;
begin
  select * into v_row from public.friend_connections where id = p_connection_id;
  if not found or (v_row.requester_id <> auth.uid() and v_row.addressee_id <> auth.uid()) then
    raise exception 'Connection not found';
  end if;

  update public.friend_connections set status = 'blocked', blocked_by = auth.uid(), responded_at = now()
  where id = p_connection_id
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: payment_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    split_id uuid NOT NULL,
    payer_user_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    recipient_upi_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    provider text DEFAULT 'manual_confirmation'::text NOT NULL,
    provider_order_id text,
    provider_payment_id text,
    upi_transaction_id text,
    upi_app text,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    CONSTRAINT payment_attempts_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_attempts_not_self CHECK ((payer_user_id <> recipient_user_id)),
    CONSTRAINT payment_attempts_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'processing'::text, 'pending'::text, 'verified'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: cancel_upi_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_upi_payment(p_attempt_id uuid) RETURNS public.payment_attempts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.payment_attempts;
begin
  select * into v_row from public.payment_attempts where id = p_attempt_id and payer_user_id = auth.uid();
  if not found then
    raise exception 'Payment attempt not found.';
  end if;
  if v_row.status not in ('initiated', 'processing', 'pending') then
    return v_row;
  end if;
  update public.payment_attempts
    set status = 'failed', failure_reason = 'Cancelled by payer'
    where id = p_attempt_id
    returning * into v_row;
  return v_row;
end;
$$;


--
-- Name: check_rename_poll(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rename_poll(p_poll_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id from group_polls where id = p_poll_id and purpose = 'rename';
  if v_group_id is null then
    return;
  end if;
  if not private.is_chat_group_member(v_group_id, auth.uid()) then
    raise exception 'not a member of this group';
  end if;
  perform private.finalize_rename_poll(p_poll_id, false);
end;
$$;


--
-- Name: throw_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throw_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message_text text NOT NULL,
    strokes jsonb,
    pen_color text,
    recurrence_type text NOT NULL,
    days_of_week integer[],
    day_of_month integer,
    hour integer NOT NULL,
    minute integer NOT NULL,
    next_trigger_at timestamp with time zone NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT throw_alerts_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31))),
    CONSTRAINT throw_alerts_has_content CHECK ((length(TRIM(BOTH FROM message_text)) > 0)),
    CONSTRAINT throw_alerts_hour_check CHECK (((hour >= 0) AND (hour <= 23))),
    CONSTRAINT throw_alerts_minute_check CHECK (((minute >= 0) AND (minute <= 59))),
    CONSTRAINT throw_alerts_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['once'::text, 'everyday'::text, 'weekly'::text, 'monthly'::text])))
);


--
-- Name: confirm_throw_alert(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_throw_alert(p_throw_id uuid, p_next_trigger_at timestamp with time zone) RETURNS public.throw_alerts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.throws;
  v_alert public.throw_alerts;
begin
  select * into v_row from public.throws where id = p_throw_id and recipient_id = auth.uid();
  if v_row.id is null then
    raise exception 'letter not found';
  end if;
  if v_row.alert_recurrence_type is null then
    raise exception 'this letter has no reminder to confirm';
  end if;
  if v_row.alert_confirmed then
    raise exception 'already confirmed';
  end if;
  if p_next_trigger_at <= now() then
    raise exception 'next trigger must be in the future';
  end if;

  insert into public.throw_alerts (
    user_id, message_text, strokes, pen_color, recurrence_type,
    days_of_week, day_of_month, hour, minute, next_trigger_at
  ) values (
    auth.uid(),
    coalesce(nullif(trim(both from v_row.message_text), ''), 'A letter reminder'),
    v_row.strokes, v_row.pen_color, v_row.alert_recurrence_type,
    v_row.alert_days_of_week, v_row.alert_day_of_month, v_row.alert_hour, v_row.alert_minute,
    p_next_trigger_at
  )
  returning * into v_alert;

  update public.throws set alert_confirmed = true, alert_confirmed_at = now() where id = p_throw_id;

  return v_alert;
end;
$$;


--
-- Name: confirm_upi_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_upi_payment(p_attempt_id uuid) RETURNS public.payment_attempts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.payment_attempts;
  v_payer_name text;
  v_recipient_name text;
begin
  select * into v_row from public.payment_attempts where id = p_attempt_id and recipient_user_id = auth.uid();
  if not found then
    raise exception 'Payment attempt not found.';
  end if;
  if v_row.status = 'verified' then
    return v_row;
  end if;
  if v_row.status not in ('initiated', 'processing', 'pending') then
    raise exception 'This payment can no longer be confirmed.';
  end if;

  update public.payment_attempts
    set status = 'verified', verified_at = now()
    where id = p_attempt_id
    returning * into v_row;

  insert into public.split_settlements (group_id, from_user_id, to_user_id, amount, payment_attempt_id, source)
  values (v_row.split_id, v_row.payer_user_id, v_row.recipient_user_id, v_row.amount, v_row.id, 'upi');

  select coalesce(full_name, 'Someone') into v_recipient_name from public.profiles where id = v_row.recipient_user_id;
  select coalesce(full_name, 'Someone') into v_payer_name from public.profiles where id = v_row.payer_user_id;

  if private.in_app_pref_enabled(v_row.payer_user_id, 'payment_activity') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
    values (
      v_row.payer_user_id, 'payment_activity', 'Payment verified',
      'Your ₹' || trim(to_char(v_row.amount, 'FM999999999')) || ' payment to ' || v_recipient_name || ' has been confirmed.',
      'group', v_row.split_id::text
    );
  end if;
  if private.in_app_pref_enabled(v_row.recipient_user_id, 'payment_activity') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
    values (
      v_row.recipient_user_id, 'payment_activity', 'Payment received',
      v_payer_name || ' confirmed sending you ₹' || trim(to_char(v_row.amount, 'FM999999999')) || '.',
      'group', v_row.split_id::text
    );
  end if;

  return v_row;
end;
$$;


--
-- Name: count_mutual_friends(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_mutual_friends(p_target_user_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::integer
  from (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as friend_id
    from public.friend_connections
    where status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid())
  ) my_friends
  where private.is_accepted_friend(friend_id, p_target_user_id);
$$;


--
-- Name: create_game_room(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_game_room(p_rounds integer, p_timer_seconds integer, p_name text) RETURNS TABLE(game_id uuid, room_code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_code text;
  v_game_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  loop
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    exit when not exists (select 1 from game_rooms where game_rooms.room_code = v_code and status <> 'game_complete');
  end loop;

  insert into game_rooms (room_code, host_id, rounds_total, timer_seconds)
    values (v_code, auth.uid(), greatest(1, least(p_rounds, 20)), greatest(15, least(p_timer_seconds, 180)))
    returning id into v_game_id;

  insert into game_players (game_id, user_id, name, ready)
    values (v_game_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Host'), true);

  return query select v_game_id, v_code;
end;
$$;


--
-- Name: create_trivia_game(text, text, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_trivia_game(p_category text, p_difficulty text, p_question_count integer, p_time_per_question integer, p_name text) RETURNS TABLE(game_id uuid, room_code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_code text;
  v_game_id uuid;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from trivia_games where trivia_games.room_code = v_code and trivia_games.status not in ('completed', 'cancelled'));
  end loop;

  insert into trivia_games (room_code, host_id, category, difficulty, question_count, time_per_question)
    values (
      v_code,
      auth.uid(),
      coalesce(nullif(trim(p_category), ''), 'Random'),
      coalesce(nullif(trim(p_difficulty), ''), 'mixed'),
      greatest(5, least(coalesce(p_question_count, 10), 20)),
      greatest(10, least(coalesce(p_time_per_question, 20), 60))
    )
    returning id into v_game_id;

  insert into trivia_players (game_id, user_id, name)
    values (v_game_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Host'));

  return query select v_game_id, v_code;
end;
$$;


--
-- Name: create_upi_payment(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_upi_payment(p_split_id uuid, p_recipient_id uuid, p_amount numeric) RETURNS public.payment_attempts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_payer_id uuid := auth.uid();
  v_recipient_profile public.user_payment_profiles;
  v_net_debt numeric;
  v_existing public.payment_attempts;
  v_reference text;
  v_row public.payment_attempts;
begin
  if v_payer_id = p_recipient_id then
    raise exception 'You cannot pay yourself.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;
  if not (private.is_split_member(p_split_id, v_payer_id) or private.is_split_owner(p_split_id, v_payer_id)) then
    raise exception 'You are not a member of this split.';
  end if;
  if not (private.is_split_member(p_split_id, p_recipient_id) or private.is_split_owner(p_split_id, p_recipient_id)) then
    raise exception 'That person is not a member of this split.';
  end if;

  select * into v_recipient_profile from public.user_payment_profiles where user_id = p_recipient_id;
  if not found or v_recipient_profile.upi_id is null or not v_recipient_profile.upi_verified then
    raise exception 'That person has not added a verified UPI ID yet.';
  end if;

  select * into v_existing from public.payment_attempts
  where split_id = p_split_id and payer_user_id = v_payer_id and recipient_user_id = p_recipient_id
    and status in ('initiated', 'processing', 'pending');
  if found then
    return v_existing;
  end if;

  select coalesce(sum(ses.share_amount), 0) into v_net_debt
  from public.split_expense_shares ses
  join public.split_expenses se on se.id = ses.expense_id
  where se.group_id = p_split_id and se.paid_by = p_recipient_id and ses.user_id = v_payer_id;

  v_net_debt := v_net_debt - coalesce((
    select sum(amount) from public.split_settlements
    where group_id = p_split_id and from_user_id = v_payer_id and to_user_id = p_recipient_id
  ), 0);

  if p_amount > v_net_debt + 0.01 then
    raise exception 'That amount is more than you currently owe in this split.';
  end if;

  v_reference := 'MS' || to_char(now(), 'YYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 6));

  insert into public.payment_attempts (reference, split_id, payer_user_id, recipient_user_id, recipient_upi_id, amount)
  values (v_reference, p_split_id, v_payer_id, p_recipient_id, v_recipient_profile.upi_id, p_amount)
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: delete_own_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_own_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.split_planned_spots where created_by = uid;
  delete from auth.users where id = uid;
end;
$$;


--
-- Name: delete_own_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_own_data() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.rooms where user_id = uid;

  delete from public.budget_cards where owner_id = uid;
  delete from public.card_expenses where user_id = uid;
  delete from public.card_members where user_id = uid;

  delete from public.split_groups where owner_id = uid;
  delete from public.split_expenses where paid_by = uid;
  delete from public.split_expense_shares where user_id = uid;
  delete from public.split_settlements where from_user_id = uid or to_user_id = uid;
  delete from public.split_chat_messages where user_id = uid;
  delete from public.split_locations where user_id = uid;
  delete from public.split_planned_spots where created_by = uid;
  delete from public.split_members where user_id = uid;
end;
$$;


--
-- Name: delete_throw(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_throw(p_throw_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.throws;
begin
  select * into v_row from public.throws where id = p_throw_id and (sender_id = auth.uid() or recipient_id = auth.uid());
  if v_row.id is null then
    raise exception 'letter not found';
  end if;

  if v_row.sender_id = auth.uid() then
    update public.throws set deleted_by_sender = true where id = p_throw_id;
  end if;
  if v_row.recipient_id = auth.uid() then
    update public.throws set deleted_by_recipient = true where id = p_throw_id;
  end if;

  -- Once both sides have removed it from their own view, there's nothing left to keep.
  delete from public.throws
  where id = p_throw_id and deleted_by_sender = true and deleted_by_recipient = true;
end;
$$;


--
-- Name: direct_messages_link_throw(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.direct_messages_link_throw() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$begin if new.kind = 'letter' and new.throw_id is null then select t.id into new.throw_id from throws t join friend_connections c on c.id = new.connection_id where t.sender_id = new.sender_id and t.recipient_id = case when c.requester_id = new.sender_id then c.addressee_id else c.requester_id end and t.created_at > now() - interval '2 minutes' order by t.created_at desc limit 1; end if; return new; end$$;


--
-- Name: find_profile_by_friend_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_profile_by_friend_code(p_code text) RETURNS TABLE(id uuid, full_name text, username text, avatar_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return query
    select p.id, p.full_name, p.username, p.avatar_url
    from public.profiles p
    where p.friend_code = upper(trim(p_code)) and p.id <> auth.uid();
end;
$$;


--
-- Name: get_map_locations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_map_locations() RETURNS TABLE(user_id uuid, city text, country text, latitude double precision, longitude double precision, updated_at timestamp with time zone, full_name text, avatar_url text, is_friend boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    tp.user_id,
    tp.city,
    tp.country,
    tp.latitude,
    tp.longitude,
    tp.updated_at,
    p.full_name,
    p.avatar_url,
    exists (
      select 1 from friend_connections fc
      where fc.status = 'accepted'
        and ((fc.requester_id = auth.uid() and fc.addressee_id = tp.user_id)
          or (fc.addressee_id = auth.uid() and fc.requester_id = tp.user_id))
    ) as is_friend
  from public.throw_profiles tp
  join public.profiles p on p.id = tp.user_id
  where tp.user_id <> auth.uid()
    and (
      tp.location_visibility = 'all'
      or (
        tp.location_visibility = 'friends'
        and exists (
          select 1 from friend_connections fc
          where fc.status = 'accepted'
            and ((fc.requester_id = auth.uid() and fc.addressee_id = tp.user_id)
              or (fc.addressee_id = auth.uid() and fc.requester_id = tp.user_id))
        )
      )
    );
$$;


--
-- Name: get_unread_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_counts() RETURNS TABLE(connection_id uuid, unread_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select dm.connection_id, count(*)::integer as unread_count
  from public.direct_messages dm
  join public.friend_connections fc on fc.id = dm.connection_id
  left join public.direct_message_reads dmr
    on dmr.connection_id = dm.connection_id and dmr.user_id = auth.uid()
  where fc.status = 'accepted'
    and (fc.requester_id = auth.uid() or fc.addressee_id = auth.uid())
    and dm.sender_id <> auth.uid()
    and dm.created_at > coalesce(dmr.last_read_at, 'epoch'::timestamptz)
  group by dm.connection_id;
$$;


--
-- Name: heartbeat_trivia_presence(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.heartbeat_trivia_presence(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  if not private.is_trivia_player(p_game_id, auth.uid()) then
    raise exception 'not a player in this game';
  end if;
  update trivia_players set last_seen_at = now()
    where game_id = p_game_id and user_id = auth.uid() and left_at is null;
  perform private.maybe_transfer_trivia_host(p_game_id);
end;
$$;


--
-- Name: hug_throw(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hug_throw(p_throw_id uuid, p_count integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$declare n integer; begin update public.throws set hug_count = hug_count + greatest(0, least(coalesce(p_count, 0), 200)) where id = p_throw_id and recipient_id = auth.uid() returning hug_count into n; return coalesce(n, 0); end;$$;


--
-- Name: budget_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    label text NOT NULL,
    bg text NOT NULL,
    ink text NOT NULL,
    sub text NOT NULL,
    art_a text NOT NULL,
    art_b text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    rid text NOT NULL,
    reset_day text DEFAULT '1st'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cycle_started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reset_prompt_at timestamp with time zone
);


--
-- Name: join_budget_card(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_budget_card(p_rid text) RETURNS public.budget_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_card public.budget_cards;
  v_joiner_name text;
begin
  select * into v_card from public.budget_cards where rid = p_rid;
  if not found then
    raise exception 'Invalid join code';
  end if;
  if v_card.owner_id <> auth.uid() then
    insert into public.card_members (card_id, user_id)
    values (v_card.id, auth.uid())
    on conflict (card_id, user_id) do nothing;

    select coalesce(full_name, 'Someone') into v_joiner_name from public.profiles where id = auth.uid();
    if private.in_app_pref_enabled(v_card.owner_id, 'invitations') then
      insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
      values (v_card.owner_id, 'invitations', 'New card member', coalesce(v_joiner_name, 'Someone') || ' joined "' || v_card.label || '"', 'card', v_card.id::text);
    end if;
  end if;
  return v_card;
end;
$$;


--
-- Name: join_game_room(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_game_room(p_room_code text, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id, status into v_game_id, v_status from game_rooms where room_code = p_room_code order by created_at desc limit 1;
  if v_game_id is null then
    raise exception 'no game with that code';
  end if;
  if v_status <> 'waiting' then
    raise exception 'that game has already started';
  end if;

  insert into game_players (game_id, user_id, name)
    values (v_game_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Player'))
  on conflict (game_id, user_id) do update set left_at = null, name = excluded.name;

  return v_game_id;
end;
$$;


--
-- Name: split_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    currency text DEFAULT '₹'::text NOT NULL,
    split_mode text DEFAULT 'equal'::text NOT NULL,
    who_can_add text DEFAULT 'anyone'::text NOT NULL,
    remind_settlements boolean DEFAULT false NOT NULL,
    rid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: join_split_group(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_split_group(p_rid text) RETURNS public.split_groups
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_group public.split_groups;
  v_joiner_name text;
begin
  select * into v_group from public.split_groups where rid = p_rid;
  if not found then
    raise exception 'Invalid join code';
  end if;
  if v_group.owner_id <> auth.uid() then
    insert into public.split_members (group_id, user_id)
    values (v_group.id, auth.uid())
    on conflict (group_id, user_id) do nothing;

    select coalesce(full_name, 'Someone') into v_joiner_name from public.profiles where id = auth.uid();
    if private.in_app_pref_enabled(v_group.owner_id, 'invitations') then
      insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
      values (v_group.owner_id, 'invitations', 'New split member', coalesce(v_joiner_name, 'Someone') || ' joined "' || v_group.name || '"', 'group', v_group.id::text);
    end if;
  end if;
  return v_group;
end;
$$;


--
-- Name: join_trivia_game(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_trivia_game(p_room_code text, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game record;
  v_active_count int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into v_game from trivia_games where room_code = upper(trim(p_room_code)) order by created_at desc limit 1;
  if v_game.id is null then raise exception 'no game with that code'; end if;
  if v_game.status <> 'waiting' then raise exception 'that game has already started'; end if;

  if exists (select 1 from trivia_players where game_id = v_game.id and user_id = auth.uid()) then
    update trivia_players set left_at = null, last_seen_at = now(), name = coalesce(nullif(trim(p_name), ''), name)
      where game_id = v_game.id and user_id = auth.uid();
    return v_game.id;
  end if;

  select count(*) into v_active_count from trivia_players where game_id = v_game.id and left_at is null;
  if v_active_count >= 20 then raise exception 'that game is full'; end if;

  insert into trivia_players (game_id, user_id, name)
    values (v_game.id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Player'));

  return v_game.id;
end;
$$;


--
-- Name: leave_game_room(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_game_room(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  update game_players set left_at = now() where game_id = p_game_id and user_id = auth.uid();
end;
$$;


--
-- Name: leave_trivia_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_trivia_game(p_game_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  update trivia_players set left_at = now() where game_id = p_game_id and user_id = auth.uid();
  perform private.maybe_transfer_trivia_host(p_game_id);
end;
$$;


--
-- Name: lock_expired_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_expired_round(p_round_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game_id uuid;
begin
  select game_id into v_game_id from game_rounds where id = p_round_id;
  if v_game_id is null or not private.is_game_player(v_game_id, auth.uid()) then
    raise exception 'not a player in this game';
  end if;
  update game_rounds set status = 'locked'
    where id = p_round_id and status = 'playing' and end_time <= now();
end;
$$;


--
-- Name: mark_thread_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_thread_read(p_connection_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.friend_connections
    where id = p_connection_id
      and status = 'accepted'
      and (requester_id = auth.uid() or addressee_id = auth.uid())
  ) then
    raise exception 'not a party to this connection';
  end if;

  insert into public.direct_message_reads (connection_id, user_id, last_read_at)
  values (p_connection_id, auth.uid(), now())
  on conflict (connection_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;


--
-- Name: mark_throw_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_throw_read(p_throw_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.throws
  set status = case when status = 'thrown' then 'read' else status end,
      read_at = coalesce(read_at, now())
  where id = p_throw_id and recipient_id = auth.uid();
end;
$$;


--
-- Name: mark_upi_payment_sent(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_upi_payment_sent(p_attempt_id uuid, p_upi_app text DEFAULT NULL::text) RETURNS public.payment_attempts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.payment_attempts;
begin
  select * into v_row from public.payment_attempts where id = p_attempt_id and payer_user_id = auth.uid();
  if not found then
    raise exception 'Payment attempt not found.';
  end if;
  if v_row.status not in ('initiated', 'processing') then
    return v_row;
  end if;
  update public.payment_attempts
    set status = 'pending', upi_app = coalesce(p_upi_app, upi_app)
    where id = p_attempt_id
    returning * into v_row;
  return v_row;
end;
$$;


--
-- Name: notify_card_expense_activity(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_card_expense_activity(p_card_id uuid, p_expense_title text, p_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_card public.budget_cards;
  v_actor_name text;
begin
  select * into v_card from public.budget_cards where id = p_card_id;
  if not found then
    return;
  end if;
  if v_card.owner_id <> auth.uid() and not exists (
    select 1 from public.card_members where card_id = p_card_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this card';
  end if;

  select coalesce(full_name, 'Someone') into v_actor_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
  select m.user_id, 'shared_space_activity',
    v_card.label || ' — new spend',
    coalesce(v_actor_name, 'Someone') || ' added "' || p_expense_title || '" (' || p_amount || ')',
    'card', p_card_id::text
  from (
    select owner_id as user_id from public.budget_cards where id = p_card_id
    union
    select user_id from public.card_members where card_id = p_card_id
  ) m
  where m.user_id <> auth.uid()
    and private.in_app_pref_enabled(m.user_id, 'shared_space_activity');
end;
$$;


--
-- Name: notify_chat_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_chat_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_conn public.friend_connections;
  v_recipient_id uuid;
  v_sender_name text;
  v_preview text;
begin
  if new.kind = 'system' then
    return new;
  end if;

  select * into v_conn from public.friend_connections where id = new.connection_id;
  if not found then
    return new;
  end if;

  v_recipient_id := case when v_conn.requester_id = new.sender_id then v_conn.addressee_id else v_conn.requester_id end;
  select coalesce(full_name, 'Someone') into v_sender_name from public.profiles where id = new.sender_id;
  v_preview := coalesce(nullif(trim(new.text), ''), case when new.attachment_url is not null then 'Sent a photo' else 'New message' end);

  if private.in_app_pref_enabled(v_recipient_id, 'chat_message') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
    values (v_recipient_id, 'chat_message', coalesce(v_sender_name, 'Someone'), 'sent you a message' || chr(10) || v_preview, 'connection', v_conn.id::text, new.sender_id);
  end if;

  return new;
end;
$$;


--
-- Name: notify_split_expense_activity(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_split_expense_activity(p_group_id uuid, p_expense_title text, p_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_group public.split_groups;
  v_actor_name text;
begin
  select * into v_group from public.split_groups where id = p_group_id;
  if not found then
    return;
  end if;
  if v_group.owner_id <> auth.uid() and not exists (
    select 1 from public.split_members where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this split';
  end if;

  select coalesce(full_name, 'Someone') into v_actor_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
  select m.user_id, 'split_activity',
    v_group.name || ' — new expense',
    coalesce(v_actor_name, 'Someone') || ' added "' || p_expense_title || '" (' || p_amount || ')',
    'group', p_group_id::text
  from (
    select owner_id as user_id from public.split_groups where id = p_group_id
    union
    select user_id from public.split_members where group_id = p_group_id
  ) m
  where m.user_id <> auth.uid()
    and private.in_app_pref_enabled(m.user_id, 'split_activity');
end;
$$;


--
-- Name: notify_status_posted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_status_posted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
begin
  select coalesce(full_name, 'Someone') into v_name from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
  select fc.other_id, 'status_posted', coalesce(v_name, 'Someone'), 'posted a new status', 'story', new.user_id::text, new.user_id
  from (
    select case when requester_id = new.user_id then addressee_id else requester_id end as other_id
    from public.friend_connections
    where status = 'accepted' and (requester_id = new.user_id or addressee_id = new.user_id)
  ) fc
  where private.in_app_pref_enabled(fc.other_id, 'status_posted');

  return new;
end;
$$;


--
-- Name: nudge_friend_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nudge_friend_request(p_connection_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.friend_connections;
  v_requester_name text;
begin
  select * into v_row from public.friend_connections
  where id = p_connection_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Request not found';
  end if;

  select coalesce(full_name, 'Someone') into v_requester_name from public.profiles where id = auth.uid();
  if private.in_app_pref_enabled(v_row.addressee_id, 'friend_requests') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
    values (v_row.addressee_id, 'friend_requests', coalesce(v_requester_name, 'Someone'), 'is still waiting to connect', 'connection', v_row.id::text, auth.uid());
  end if;
end;
$$;


--
-- Name: remind_upi_setup(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remind_upi_setup(p_user_id uuid, p_split_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_sender_name text;
begin
  if not private.shares_split_group(auth.uid(), p_user_id) then
    raise exception 'You do not share a split with that person.';
  end if;
  select coalesce(full_name, 'Someone') into v_sender_name from public.profiles where id = auth.uid();
  if private.in_app_pref_enabled(p_user_id, 'payment_activity') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id)
    values (p_user_id, 'payment_activity', 'Add your UPI ID', v_sender_name || ' wants to pay you and is waiting for your UPI ID.', 'group', p_split_id::text);
  end if;
end;
$$;


--
-- Name: remove_friend_connection(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_friend_connection(p_connection_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.friend_connections
  where id = p_connection_id and (requester_id = auth.uid() or addressee_id = auth.uid());
end;
$$;


--
-- Name: respond_friend_request(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_friend_request(p_connection_id uuid, p_accept boolean) RETURNS public.friend_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.friend_connections;
  v_addressee_name text;
begin
  select * into v_row from public.friend_connections where id = p_connection_id;
  if not found or v_row.addressee_id <> auth.uid() then
    raise exception 'Request not found';
  end if;

  if not p_accept then
    delete from public.friend_connections where id = p_connection_id;
    return null;
  end if;

  update public.friend_connections set status = 'accepted', responded_at = now()
  where id = p_connection_id
  returning * into v_row;

  select coalesce(full_name, 'Someone') into v_addressee_name from public.profiles where id = auth.uid();
  if private.in_app_pref_enabled(v_row.requester_id, 'friend_requests') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
    values (v_row.requester_id, 'friend_requests', coalesce(v_addressee_name, 'Someone'), 'accepted your friend request', 'connection', v_row.id::text, auth.uid());
  end if;
  return v_row;
end;
$$;


--
-- Name: search_profiles(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_profiles(p_query text) RETURNS TABLE(user_id uuid, full_name text, username text, avatar_url text, mutual_friend_count integer, connection_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    p.id as user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    public.count_mutual_friends(p.id) as mutual_friend_count,
    coalesce(
      (select case
        when fc.status = 'accepted' then 'accepted'
        when fc.status = 'blocked' then 'blocked'
        when fc.requester_id = auth.uid() then 'pending_sent'
        else 'pending_received'
      end
      from public.friend_connections fc
      where fc.user_lo = least(auth.uid(), p.id) and fc.user_hi = greatest(auth.uid(), p.id)),
      'none'
    ) as connection_status
  from public.profiles p
  where p.id <> auth.uid()
    and trim(coalesce(p_query, '')) <> ''
    and (p.full_name ilike '%' || trim(p_query) || '%' or p.username ilike '%' || trim(p_query) || '%')
  order by p.full_name nulls last
  limit 20;
$$;


--
-- Name: FUNCTION search_profiles(p_query text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_profiles(p_query text) IS 'Searches profiles by full_name/username for the Throw Add Friend card — excludes the caller, includes each result''s connection_status and mutual_friend_count so the UI can render the right button state.';


--
-- Name: send_friend_request(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_friend_request(p_code text, p_message text DEFAULT NULL::text) RETURNS public.friend_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_target_id uuid;
  v_row public.friend_connections;
  v_requester_name text;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  select id into v_target_id from public.profiles where friend_code = upper(trim(p_code));
  if not found then
    raise exception 'No one has that code';
  end if;
  if v_target_id = auth.uid() then
    raise exception 'That is your own code';
  end if;

  select * into v_row from public.friend_connections
  where user_lo = least(auth.uid(), v_target_id) and user_hi = greatest(auth.uid(), v_target_id);

  if found then
    if v_row.status = 'blocked' then
      raise exception 'Could not send a friend request to this person';
    end if;
    if v_row.status = 'accepted' then
      return v_row;
    end if;
    if v_row.requester_id = auth.uid() then
      return v_row;
    end if;
    -- The other side already requested us: this add mutually matches.
    update public.friend_connections set status = 'accepted', responded_at = now()
    where id = v_row.id
    returning * into v_row;

    select coalesce(full_name, 'Someone') into v_requester_name from public.profiles where id = auth.uid();
    if private.in_app_pref_enabled(v_row.requester_id, 'friend_requests') then
      insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
      values (v_row.requester_id, 'friend_requests', coalesce(v_requester_name, 'Someone'), 'accepted your friend request', 'connection', v_row.id::text, auth.uid());
    end if;
    return v_row;
  end if;

  insert into public.friend_connections (requester_id, addressee_id, intro_message)
  values (auth.uid(), v_target_id, v_message)
  returning * into v_row;

  select coalesce(full_name, 'Someone') into v_requester_name from public.profiles where id = auth.uid();
  if private.in_app_pref_enabled(v_target_id, 'friend_requests') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
    values (v_target_id, 'friend_requests', coalesce(v_requester_name, 'Someone'), 'wants to be friends', 'connection', v_row.id::text, auth.uid());
  end if;
  return v_row;
end;
$$;


--
-- Name: send_friend_request_by_user_id(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_friend_request_by_user_id(p_target_user_id uuid, p_message text DEFAULT NULL::text) RETURNS public.friend_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.friend_connections;
  v_requester_name text;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if p_target_user_id = auth.uid() then
    raise exception 'That is your own account';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'That person could not be found';
  end if;

  select * into v_row from public.friend_connections
  where user_lo = least(auth.uid(), p_target_user_id) and user_hi = greatest(auth.uid(), p_target_user_id);

  if found then
    if v_row.status = 'blocked' then
      raise exception 'Could not send a friend request to this person';
    end if;
    if v_row.status = 'accepted' then
      return v_row;
    end if;
    if v_row.requester_id = auth.uid() then
      return v_row;
    end if;
    -- The other side already requested us: this add mutually matches.
    update public.friend_connections set status = 'accepted', responded_at = now()
    where id = v_row.id
    returning * into v_row;

    select coalesce(full_name, 'Someone') into v_requester_name from public.profiles where id = auth.uid();
    if private.in_app_pref_enabled(v_row.requester_id, 'friend_requests') then
      insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
      values (v_row.requester_id, 'friend_requests', coalesce(v_requester_name, 'Someone'), 'accepted your friend request', 'connection', v_row.id::text, auth.uid());
    end if;
    return v_row;
  end if;

  insert into public.friend_connections (requester_id, addressee_id, intro_message)
  values (auth.uid(), p_target_user_id, v_message)
  returning * into v_row;

  select coalesce(full_name, 'Someone') into v_requester_name from public.profiles where id = auth.uid();
  if private.in_app_pref_enabled(p_target_user_id, 'friend_requests') then
    insert into public.notifications (user_id, category, title, body, entity_type, entity_id, related_user_id)
    values (p_target_user_id, 'friend_requests', coalesce(v_requester_name, 'Someone'), 'wants to be friends', 'connection', v_row.id::text, auth.uid());
  end if;
  return v_row;
end;
$$;


--
-- Name: throws; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throws (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    message_text text,
    strokes jsonb,
    pen_color text,
    sender_city text NOT NULL,
    sender_country text NOT NULL,
    sender_latitude double precision NOT NULL,
    sender_longitude double precision NOT NULL,
    recipient_city text NOT NULL,
    recipient_country text NOT NULL,
    recipient_latitude double precision NOT NULL,
    recipient_longitude double precision NOT NULL,
    distance_miles numeric NOT NULL,
    status text DEFAULT 'thrown'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    replied_to_throw_id uuid,
    photo_url text,
    deleted_by_sender boolean DEFAULT false NOT NULL,
    deleted_by_recipient boolean DEFAULT false NOT NULL,
    photo_urls text[],
    photo_trim_start_ms integer[],
    photo_trim_end_ms integer[],
    alert_recurrence_type text,
    alert_days_of_week integer[],
    alert_day_of_month integer,
    alert_hour integer,
    alert_minute integer,
    alert_confirmed boolean DEFAULT false NOT NULL,
    alert_confirmed_at timestamp with time zone,
    hug_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT throws_alert_day_of_month_check CHECK (((alert_day_of_month IS NULL) OR ((alert_day_of_month >= 1) AND (alert_day_of_month <= 31)))),
    CONSTRAINT throws_alert_hour_check CHECK (((alert_hour IS NULL) OR ((alert_hour >= 0) AND (alert_hour <= 23)))),
    CONSTRAINT throws_alert_minute_check CHECK (((alert_minute IS NULL) OR ((alert_minute >= 0) AND (alert_minute <= 59)))),
    CONSTRAINT throws_alert_recurrence_type_check CHECK (((alert_recurrence_type IS NULL) OR (alert_recurrence_type = ANY (ARRAY['once'::text, 'everyday'::text, 'weekly'::text, 'monthly'::text])))),
    CONSTRAINT throws_has_content CHECK (((message_text IS NOT NULL) OR (strokes IS NOT NULL))),
    CONSTRAINT throws_status_check CHECK ((status = ANY (ARRAY['thrown'::text, 'read'::text, 'replied'::text])))
);


--
-- Name: COLUMN throws.photo_trim_start_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.throws.photo_trim_start_ms IS 'Per-attachment trim window start (ms), index-aligned with photo_urls; null entries mean "no trim" (a photo, or a video within the 15s cap).';


--
-- Name: COLUMN throws.photo_trim_end_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.throws.photo_trim_end_ms IS 'Per-attachment trim window end (ms), index-aligned with photo_urls; null entries mean "no trim".';


--
-- Name: COLUMN throws.alert_recurrence_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.throws.alert_recurrence_type IS 'A letter''s own optional attached reminder request, proposed by the sender — null unless the sender attached one via the Bell icon. Mirrors throw_alerts'' own recurrence_type; only takes effect for the recipient once they confirm it (see alert_confirmed).';


--
-- Name: COLUMN throws.alert_confirmed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.throws.alert_confirmed IS 'True once the recipient has confirmed this letter''s attached reminder request, at which point a real throw_alerts row exists for them (see confirm_throw_alert).';


--
-- Name: send_throw(uuid, text, jsonb, text, uuid, text[], integer[], integer[], text, integer[], integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_throw(p_recipient_id uuid, p_message_text text, p_strokes jsonb, p_pen_color text, p_replied_to_throw_id uuid, p_photo_urls text[] DEFAULT NULL::text[], p_photo_trim_start_ms integer[] DEFAULT NULL::integer[], p_photo_trim_end_ms integer[] DEFAULT NULL::integer[], p_alert_recurrence_type text DEFAULT NULL::text, p_alert_days_of_week integer[] DEFAULT NULL::integer[], p_alert_day_of_month integer DEFAULT NULL::integer, p_alert_hour integer DEFAULT NULL::integer, p_alert_minute integer DEFAULT NULL::integer) RETURNS public.throws
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_sender public.throw_profiles;
  v_recipient public.throw_profiles;
  v_sender_name text;
  v_is_friend boolean;
  v_distance_miles numeric;
  v_row public.throws;
  v_lat1 double precision;
  v_lat2 double precision;
  v_dlat double precision;
  v_dlon double precision;
  v_a double precision;
  v_today date := current_date;
  v_last_date date;
  v_prior_streak integer;
  v_new_streak integer;
  v_has_photo boolean;
begin
  if p_recipient_id = auth.uid() then
    raise exception 'cannot throw to yourself';
  end if;
  if p_message_text is null and p_strokes is null and (p_photo_urls is null or array_length(p_photo_urls, 1) is null) then
    raise exception 'a letter needs a message';
  end if;
  if p_alert_recurrence_type is not null and p_alert_recurrence_type not in ('once','everyday','weekly','monthly') then
    raise exception 'invalid alert recurrence type';
  end if;

  select exists (
    select 1 from public.friend_connections
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = p_recipient_id)
        or (requester_id = p_recipient_id and addressee_id = auth.uid()))
  ) into v_is_friend;
  if not v_is_friend then
    raise exception 'not friends with this user';
  end if;

  select * into v_sender from public.throw_profiles where user_id = auth.uid();
  if v_sender.user_id is null then
    raise exception 'set your Throw location first';
  end if;

  select * into v_recipient from public.throw_profiles where user_id = p_recipient_id;
  if v_recipient.user_id is null then
    raise exception 'recipient has not set their Throw location yet';
  end if;

  if p_replied_to_throw_id is not null then
    if not exists (
      select 1 from public.throws
      where id = p_replied_to_throw_id
        and sender_id = p_recipient_id
        and recipient_id = auth.uid()
    ) then
      raise exception 'can only throw back a letter you received';
    end if;
  end if;

  -- Haversine, in miles (earth radius 3958.8mi).
  v_lat1 := radians(v_sender.latitude);
  v_lat2 := radians(v_recipient.latitude);
  v_dlat := radians(v_recipient.latitude - v_sender.latitude);
  v_dlon := radians(v_recipient.longitude - v_sender.longitude);
  v_a := sin(v_dlat / 2) ^ 2 + cos(v_lat1) * cos(v_lat2) * sin(v_dlon / 2) ^ 2;
  v_distance_miles := round((2 * 3958.8 * atan2(sqrt(v_a), sqrt(1 - v_a)))::numeric, 1);

  insert into public.throws (
    sender_id, recipient_id, message_text, strokes, pen_color, photo_url, photo_urls,
    photo_trim_start_ms, photo_trim_end_ms,
    sender_city, sender_country, sender_latitude, sender_longitude,
    recipient_city, recipient_country, recipient_latitude, recipient_longitude,
    distance_miles, status, delivered_at, replied_to_throw_id,
    alert_recurrence_type, alert_days_of_week, alert_day_of_month, alert_hour, alert_minute
  ) values (
    auth.uid(), p_recipient_id, p_message_text, p_strokes, p_pen_color, p_photo_urls[1], p_photo_urls,
    p_photo_trim_start_ms, p_photo_trim_end_ms,
    v_sender.city, v_sender.country, v_sender.latitude, v_sender.longitude,
    v_recipient.city, v_recipient.country, v_recipient.latitude, v_recipient.longitude,
    v_distance_miles, 'thrown', now(), p_replied_to_throw_id,
    p_alert_recurrence_type, p_alert_days_of_week, p_alert_day_of_month, p_alert_hour, p_alert_minute
  )
  returning * into v_row;

  if p_replied_to_throw_id is not null then
    update public.throws set status = 'replied' where id = p_replied_to_throw_id and status <> 'replied';
  end if;

  -- Daily throw streak, per (sender, recipient) pair: counts a calendar day (UTC) as "kept" once
  -- the sender has thrown at least one letter to this specific recipient that day. A gap of more
  -- than one day resets to a fresh streak of 1 (this throw) rather than 0, since the streak is
  -- always at least "today" once it's counted.
  select current_streak, last_throw_date into v_prior_streak, v_last_date
  from public.throw_streaks where user_id = auth.uid() and counterpart_id = p_recipient_id;

  if v_last_date = v_today then
    v_new_streak := coalesce(v_prior_streak, 1);
  elsif v_last_date = v_today - 1 then
    v_new_streak := coalesce(v_prior_streak, 0) + 1;
  else
    v_new_streak := 1;
  end if;

  insert into public.throw_streaks (user_id, counterpart_id, current_streak, last_throw_date, updated_at)
  values (auth.uid(), p_recipient_id, v_new_streak, v_today, now())
  on conflict (user_id, counterpart_id) do update set
    current_streak = excluded.current_streak,
    last_throw_date = excluded.last_throw_date,
    updated_at = now();

  v_has_photo := p_photo_urls is not null and array_length(p_photo_urls, 1) > 0;
  select coalesce(full_name, 'Someone') into v_sender_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, category, title, body, dedupe_key, entity_type, entity_id, related_user_id)
  values (
    p_recipient_id,
    'throw',
    coalesce(v_sender_name, 'Someone'),
    (case when v_has_photo then 'threw a photo at you' else 'threw a note at you' end)
      || (case when v_recipient.city is not null and v_recipient.city <> '' then ' near ' || v_recipient.city else '' end),
    'throw:' || v_row.id::text,
    'throw',
    v_row.id::text,
    auth.uid()
  )
  on conflict do nothing;

  return v_row;
end;
$$;


--
-- Name: set_ready(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_ready(p_game_id uuid, p_ready boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
begin
  if not private.is_game_player(p_game_id, auth.uid()) then
    raise exception 'not a player in this game';
  end if;
  update game_players set ready = p_ready where game_id = p_game_id and user_id = auth.uid();
end;
$$;


--
-- Name: start_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_round(p_game_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_room record;
  v_round_id uuid;
begin
  select * into v_room from game_rooms where id = p_game_id for update;
  if v_room is null then
    raise exception 'game not found';
  end if;
  if v_room.host_id <> auth.uid() then
    raise exception 'only the host can start a round';
  end if;
  if v_room.status not in ('waiting', 'round_results') then
    raise exception 'game is not ready for a new round';
  end if;
  if v_room.current_round >= v_room.rounds_total then
    raise exception 'no rounds left';
  end if;

  insert into game_rounds (game_id, round_number, letter, start_time, end_time)
    values (
      p_game_id,
      v_room.current_round + 1,
      private.pick_npat_letter(p_game_id),
      now(),
      now() + make_interval(secs => v_room.timer_seconds)
    )
    returning id into v_round_id;

  update game_players set submitted_round_id = null where game_id = p_game_id;
  update game_rooms set status = 'playing', current_round = current_round + 1 where id = p_game_id;

  return v_round_id;
end;
$$;


--
-- Name: submit_round_answers(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_round_answers(p_round_id uuid, p_answers jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_round record;
  v_player_id uuid;
  v_item jsonb;
  v_category text;
  v_raw text;
  v_normalized text;
  v_status text;
  v_source text;
  v_confidence numeric;
  v_bank record;
  v_category_count int;
begin
  select * into v_round from game_rounds where id = p_round_id for update;
  if v_round is null then
    raise exception 'round not found';
  end if;
  if now() > v_round.end_time then
    raise exception 'the round has already ended';
  end if;
  if v_round.status <> 'playing' then
    raise exception 'answers are locked for this round';
  end if;

  select id into v_player_id from game_players where game_id = v_round.game_id and user_id = auth.uid();
  if v_player_id is null then
    raise exception 'not a player in this game';
  end if;

  for v_item in select * from jsonb_array_elements(p_answers)
  loop
    v_category := v_item->>'category';
    v_raw := coalesce(v_item->>'answer', '');
    v_normalized := lower(trim(v_raw));

    if v_normalized = '' then
      v_status := 'invalid';
      v_source := 'rules';
      v_confidence := null;
    elsif left(v_normalized, 1) <> lower(v_round.letter) then
      v_status := 'invalid';
      v_source := 'rules';
      v_confidence := null;
    else
      select * into v_bank from game_answer_bank
        where letter = v_round.letter and category = v_category and normalized_answer = v_normalized;
      if v_bank is not null then
        v_status := v_bank.status;
        if v_status = 'approved' then v_status := 'valid'; else v_status := 'invalid'; end if;
        v_source := 'database';
        v_confidence := v_bank.ai_confidence;
      else
        v_status := 'pending';
        v_source := null;
        v_confidence := null;
      end if;
    end if;

    insert into game_answers (round_id, player_id, category, answer, normalized_answer, validation_status, validation_source, ai_confidence, submitted_at)
      values (p_round_id, v_player_id, v_category, trim(v_raw), v_normalized, v_status, v_source, v_confidence, now())
    on conflict (round_id, player_id, category) do update set
      answer = excluded.answer,
      normalized_answer = excluded.normalized_answer,
      validation_status = excluded.validation_status,
      validation_source = excluded.validation_source,
      ai_confidence = excluded.ai_confidence,
      submitted_at = excluded.submitted_at;
  end loop;

  select cardinality(categories) into v_category_count from game_rooms where id = v_round.game_id;

  -- This player has now answered every category — mark them submitted for
  -- this round so every player's client can show a live submitted count.
  if (select count(*) from game_answers where round_id = p_round_id and player_id = v_player_id) >= v_category_count then
    update game_players set submitted_round_id = p_round_id where id = v_player_id;
  end if;

  -- All active players submitted every category → lock now instead of
  -- waiting out the rest of the clock.
  if not exists (
    select 1 from game_players gp
    where gp.game_id = v_round.game_id and gp.left_at is null
    and coalesce(gp.submitted_round_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_round_id
  ) then
    update game_rounds set status = 'locked' where id = p_round_id and status = 'playing';
  end if;
end;
$$;


--
-- Name: submit_trivia_answer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_trivia_answer(p_question_id uuid, p_answer_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_question record;
  v_player_id uuid;
  v_correct_id text;
  v_elapsed_ms numeric;
  v_total_ms numeric;
  v_is_correct boolean;
  v_speed_bonus int;
  v_points int;
  v_active_count int;
  v_answered_count int;
begin
  if p_answer_id not in ('a', 'b', 'c', 'd') then raise exception 'invalid answer id'; end if;

  select * into v_question from trivia_questions where id = p_question_id for update;
  if v_question.id is null then raise exception 'question not found'; end if;
  if v_question.status <> 'active' then raise exception 'this question is no longer active'; end if;
  if now() > v_question.ends_at then raise exception 'time is up for this question'; end if;

  select id into v_player_id from trivia_players where game_id = v_question.game_id and user_id = auth.uid() and left_at is null;
  if v_player_id is null then raise exception 'not an active player in this game'; end if;

  if exists (select 1 from trivia_answers where question_id = p_question_id and player_id = v_player_id) then
    raise exception 'you already answered this question';
  end if;

  select correct_answer_id into v_correct_id from trivia_correct_answers where question_id = p_question_id;
  v_is_correct := (p_answer_id = v_correct_id);

  v_elapsed_ms := greatest(0, extract(epoch from (now() - v_question.starts_at)) * 1000);
  v_total_ms := extract(epoch from (v_question.ends_at - v_question.starts_at)) * 1000;
  v_speed_bonus := case when v_is_correct and v_total_ms > 0
    then greatest(0, floor(50 * (1 - v_elapsed_ms / v_total_ms)))::int
    else 0 end;
  v_points := case when v_is_correct then 100 + v_speed_bonus else 0 end;

  insert into trivia_answers (game_id, question_id, player_id, answer_id, is_correct, response_time_ms, speed_bonus, points)
    values (v_question.game_id, p_question_id, v_player_id, p_answer_id, v_is_correct, round(v_elapsed_ms), v_speed_bonus, v_points);

  update trivia_players set
    score = score + v_points,
    correct_answers = correct_answers + (case when v_is_correct then 1 else 0 end),
    incorrect_answers = incorrect_answers + (case when v_is_correct then 0 else 1 end)
  where id = v_player_id;

  select count(*) into v_active_count from trivia_players where game_id = v_question.game_id and left_at is null;
  select count(*) into v_answered_count from trivia_answers where question_id = p_question_id;
  if v_answered_count >= v_active_count then
    perform private.reveal_trivia_question(p_question_id);
  end if;
end;
$$;


--
-- Name: suggested_nearby_friends(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggested_nearby_friends(p_limit integer DEFAULT 10) RETURNS TABLE(user_id uuid, full_name text, username text, avatar_url text, distance_meters double precision, mutual_friend_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (
    select latitude, longitude from public.throw_profiles where user_id = auth.uid()
  )
  select
    p.id as user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    (
      6371000 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(me.latitude)) * cos(radians(tp.latitude)) * cos(radians(tp.longitude) - radians(me.longitude))
          + sin(radians(me.latitude)) * sin(radians(tp.latitude))
        ))
      )
    ) as distance_meters,
    public.count_mutual_friends(p.id) as mutual_friend_count
  from public.throw_profiles tp
  join public.profiles p on p.id = tp.user_id
  cross join me
  where tp.user_id <> auth.uid()
    and me.latitude is not null and me.longitude is not null
    and tp.latitude is not null and tp.longitude is not null
    and not exists (
      select 1 from public.friend_connections fc
      where fc.user_lo = least(auth.uid(), tp.user_id) and fc.user_hi = greatest(auth.uid(), tp.user_id)
    )
  order by distance_meters asc
  limit greatest(1, least(p_limit, 50));
$$;


--
-- Name: FUNCTION suggested_nearby_friends(p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.suggested_nearby_friends(p_limit integer) IS 'Nearby, not-yet-connected users for the Throw Add Friend card''s "Suggested Nearby" list, ranked by real distance (haversine, meters) from the caller''s own throw_profiles location, excluding anyone already connected (any status).';


--
-- Name: throw_profiles_default_visibility(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.throw_profiles_default_visibility() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$begin if new.location_visibility is null or new.location_visibility = 'friends' then new.location_visibility := 'all'; end if; return new; end$$;


--
-- Name: unblock_friend_connection(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unblock_friend_connection(p_connection_id uuid) RETURNS public.friend_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$declare v_row public.friend_connections; begin select * into v_row from public.friend_connections where id = p_connection_id; if not found or v_row.status <> 'blocked' or v_row.blocked_by is distinct from auth.uid() then raise exception 'Connection not found'; end if; update public.friend_connections set status = 'accepted', blocked_by = null, responded_at = now() where id = p_connection_id returning * into v_row; return v_row; end$$;


--
-- Name: update_trivia_game_settings(uuid, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_trivia_game_settings(p_game_id uuid, p_category text, p_difficulty text, p_question_count integer, p_time_per_question integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_game record;
begin
  select * into v_game from trivia_games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_id <> auth.uid() then raise exception 'only the host can change settings'; end if;
  if v_game.status <> 'waiting' then raise exception 'settings can only change before the game starts'; end if;

  update trivia_games set
    category = coalesce(nullif(trim(p_category), ''), 'Random'),
    difficulty = coalesce(nullif(trim(p_difficulty), ''), 'mixed'),
    question_count = greatest(5, least(coalesce(p_question_count, 10), 20)),
    time_per_question = greatest(10, least(coalesce(p_time_per_question, 20), 60))
  where id = p_game_id;
end;
$$;


--
-- Name: user_payment_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_payment_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    upi_id text,
    upi_verified boolean DEFAULT false NOT NULL,
    upi_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_payment_profiles_upi_id_format CHECK (((upi_id IS NULL) OR (upi_id ~ '^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$'::text)))
);


--
-- Name: verify_own_upi_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_own_upi_id() RETURNS public.user_payment_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.user_payment_profiles;
begin
  select * into v_row from public.user_payment_profiles where user_id = auth.uid();
  if not found or v_row.upi_id is null then
    raise exception 'Add a UPI ID first.';
  end if;
  -- Format is already enforced by the table's check constraint; this
  -- confirms the ID is well-formed and ready to receive payments — it is
  -- NOT a bank-verified confirmation that the VPA belongs to this person.
  update public.user_payment_profiles
    set upi_verified = true, upi_verified_at = now()
    where user_id = auth.uid()
    returning * into v_row;
  return v_row;
end;
$$;


--
-- Name: card_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    spent_on date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: card_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_members (
    card_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: card_topups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_topups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT card_topups_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: chat_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: direct_message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_message_reads (
    connection_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    attachment_url text,
    throw_id uuid,
    CONSTRAINT direct_messages_content_check CHECK ((((kind = ANY (ARRAY['text'::text, 'system'::text, 'letter'::text])) AND (text IS NOT NULL) AND (length(TRIM(BOTH FROM text)) > 0)) OR ((kind = ANY (ARRAY['image'::text, 'location'::text])) AND (attachment_url IS NOT NULL)))),
    CONSTRAINT direct_messages_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'image'::text, 'location'::text, 'system'::text, 'letter'::text])))
);


--
-- Name: game_answer_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_answer_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    letter text NOT NULL,
    category text NOT NULL,
    normalized_answer text NOT NULL,
    status text NOT NULL,
    source text NOT NULL,
    ai_confidence numeric,
    times_used integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_answer_bank_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'rejected'::text])))
);


--
-- Name: game_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    player_id uuid NOT NULL,
    category text NOT NULL,
    answer text DEFAULT ''::text NOT NULL,
    normalized_answer text DEFAULT ''::text NOT NULL,
    validation_status text DEFAULT 'pending'::text NOT NULL,
    validation_source text,
    ai_confidence numeric,
    is_duplicate boolean DEFAULT false NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_answers_validation_status_check CHECK ((validation_status = ANY (ARRAY['pending'::text, 'valid'::text, 'invalid'::text, 'review'::text])))
);


--
-- Name: game_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    ready boolean DEFAULT false NOT NULL,
    total_score integer DEFAULT 0 NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    submitted_round_id uuid
);


--
-- Name: game_point_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_point_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_id uuid NOT NULL,
    game_type text NOT NULL,
    result text NOT NULL,
    points_change integer NOT NULL,
    previous_points integer NOT NULL,
    new_points integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_point_transactions_result_check CHECK ((result = ANY (ARRAY['win'::text, 'loss'::text, 'draw'::text])))
);


--
-- Name: game_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_code text NOT NULL,
    host_id uuid NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    rounds_total integer DEFAULT 5 NOT NULL,
    timer_seconds integer DEFAULT 60 NOT NULL,
    categories text[] DEFAULT ARRAY['Name'::text, 'Place'::text, 'Animal'::text, 'Thing'::text] NOT NULL,
    current_round integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_rooms_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'playing'::text, 'round_results'::text, 'game_complete'::text])))
);


--
-- Name: game_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    round_number integer NOT NULL,
    letter text NOT NULL,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text DEFAULT 'playing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_rounds_status_check CHECK ((status = ANY (ARRAY['playing'::text, 'locked'::text, 'validating'::text, 'results'::text])))
);


--
-- Name: group_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    text text,
    attachment_url text,
    poll_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_messages_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'image'::text, 'location'::text, 'poll'::text, 'system'::text, 'letter'::text])))
);


--
-- Name: group_poll_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_poll_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    group_id uuid NOT NULL,
    label text NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL
);


--
-- Name: group_poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_poll_votes (
    poll_id uuid NOT NULL,
    option_id uuid NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: group_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    created_by uuid NOT NULL,
    question text NOT NULL,
    allow_multiple boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose text DEFAULT 'general'::text NOT NULL,
    proposed_name text,
    old_name text,
    expires_at timestamp with time zone,
    resolved boolean DEFAULT false NOT NULL,
    resolution text,
    resolved_at timestamp with time zone,
    CONSTRAINT group_polls_purpose_check CHECK ((purpose = ANY (ARRAY['general'::text, 'rename'::text]))),
    CONSTRAINT group_polls_resolution_check CHECK ((resolution = ANY (ARRAY['renamed'::text, 'kept'::text])))
);


--
-- Name: location_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_shares (
    user_id uuid NOT NULL,
    status text DEFAULT 'ended'::text NOT NULL,
    visibility text DEFAULT 'all_friends'::text NOT NULL,
    started_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_latitude double precision,
    last_longitude double precision,
    last_updated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT location_shares_active_needs_expiry CHECK (((status = 'ended'::text) OR (expires_at IS NOT NULL))),
    CONSTRAINT location_shares_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text]))),
    CONSTRAINT location_shares_visibility_check CHECK ((visibility = 'all_friends'::text))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dedupe_key text,
    entity_type text,
    entity_id text,
    related_user_id uuid
);


--
-- Name: COLUMN notifications.related_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.related_user_id IS 'The other person this notification is about (sender, poster, requester) — lets the client render their real avatar without an extra lookup. Null for notifications with no single counterpart (budget/split activity, etc).';


--
-- Name: player_game_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_game_stats (
    user_id uuid NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    games_played integer DEFAULT 0 NOT NULL,
    games_won integer DEFAULT 0 NOT NULL,
    games_lost integer DEFAULT 0 NOT NULL,
    games_drawn integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL
);


--
-- Name: split_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: split_expense_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_expense_shares (
    expense_id uuid NOT NULL,
    user_id uuid NOT NULL,
    share_amount numeric NOT NULL
);


--
-- Name: split_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    paid_by uuid NOT NULL,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    split_mode text DEFAULT 'equal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: split_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_locations (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    lat double precision,
    lng double precision,
    place text DEFAULT ''::text NOT NULL,
    shared boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: split_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: split_planned_spots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_planned_spots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    created_by uuid NOT NULL,
    name text NOT NULL,
    icon text DEFAULT 'Other'::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    pos_x double precision DEFAULT 50 NOT NULL,
    pos_y double precision DEFAULT 50 NOT NULL,
    visited boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: split_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_attempt_id uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT split_settlements_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'upi'::text])))
);


--
-- Name: throw_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throw_profiles (
    user_id uuid NOT NULL,
    city text NOT NULL,
    country text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_visibility text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT throw_profiles_location_visibility_check CHECK ((location_visibility = ANY (ARRAY['friends'::text, 'all'::text, 'ghost'::text])))
);


--
-- Name: throw_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throw_stories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    media_url text NOT NULL,
    media_type text NOT NULL,
    trim_start_ms integer,
    trim_end_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT throw_stories_media_type_check CHECK ((media_type = ANY (ARRAY['photo'::text, 'video'::text])))
);


--
-- Name: throw_story_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throw_story_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    viewer_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: throw_streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.throw_streaks (
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    last_throw_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    counterpart_id uuid NOT NULL
);


--
-- Name: trivia_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trivia_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    question_id uuid NOT NULL,
    player_id uuid NOT NULL,
    answer_id text NOT NULL,
    is_correct boolean NOT NULL,
    response_time_ms integer NOT NULL,
    speed_bonus integer DEFAULT 0 NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trivia_correct_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trivia_correct_answers (
    question_id uuid NOT NULL,
    correct_answer_id text NOT NULL
);


--
-- Name: trivia_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trivia_games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_code text NOT NULL,
    host_id uuid NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    category text DEFAULT 'Random'::text NOT NULL,
    difficulty text DEFAULT 'mixed'::text NOT NULL,
    question_count integer DEFAULT 10 NOT NULL,
    time_per_question integer DEFAULT 20 NOT NULL,
    current_question_index integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trivia_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trivia_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    correct_answers integer DEFAULT 0 NOT NULL,
    incorrect_answers integer DEFAULT 0 NOT NULL,
    unanswered integer DEFAULT 0 NOT NULL,
    fastest_answers integer DEFAULT 0 NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trivia_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trivia_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    question_index integer NOT NULL,
    question_text text NOT NULL,
    category text NOT NULL,
    difficulty text NOT NULL,
    answers jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    reveal_ends_at timestamp with time zone
);


--
-- Name: user_last_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_last_seen (
    user_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    notification_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    throw_color_mode text DEFAULT 'auto'::text NOT NULL,
    throw_map_color_mode text DEFAULT 'auto'::text NOT NULL,
    throw_weather_mode text DEFAULT 'automatic'::text NOT NULL,
    throw_weather_manual_condition text DEFAULT 'clear'::text NOT NULL,
    throw_weather_manual_intensity text DEFAULT 'medium'::text NOT NULL,
    throw_weather_reduced_flashing boolean DEFAULT false NOT NULL,
    throw_map_show_background boolean DEFAULT true NOT NULL,
    CONSTRAINT throw_weather_manual_condition_check CHECK ((throw_weather_manual_condition = ANY (ARRAY['clear'::text, 'sunny'::text, 'cloudy'::text, 'rain'::text, 'thunderstorm'::text, 'lightning'::text, 'wind'::text, 'snow'::text]))),
    CONSTRAINT throw_weather_manual_intensity_check CHECK ((throw_weather_manual_intensity = ANY (ARRAY['light'::text, 'medium'::text, 'heavy'::text]))),
    CONSTRAINT throw_weather_mode_check CHECK ((throw_weather_mode = ANY (ARRAY['automatic'::text, 'manual'::text]))),
    CONSTRAINT user_settings_throw_color_mode_check CHECK ((throw_color_mode = ANY (ARRAY['auto'::text, 'day'::text, 'night'::text])))
);


--
-- Name: budget_cards budget_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_cards
    ADD CONSTRAINT budget_cards_pkey PRIMARY KEY (id);


--
-- Name: budget_cards budget_cards_rid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_cards
    ADD CONSTRAINT budget_cards_rid_key UNIQUE (rid);


--
-- Name: card_expenses card_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_expenses
    ADD CONSTRAINT card_expenses_pkey PRIMARY KEY (id);


--
-- Name: card_members card_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_members
    ADD CONSTRAINT card_members_pkey PRIMARY KEY (card_id, user_id);


--
-- Name: card_topups card_topups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_topups
    ADD CONSTRAINT card_topups_pkey PRIMARY KEY (id);


--
-- Name: chat_group_members chat_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: chat_groups chat_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);


--
-- Name: direct_message_reads direct_message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_message_reads
    ADD CONSTRAINT direct_message_reads_pkey PRIMARY KEY (connection_id, user_id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: friend_connections friend_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_connections
    ADD CONSTRAINT friend_connections_pkey PRIMARY KEY (id);


--
-- Name: game_answer_bank game_answer_bank_letter_category_normalized_answer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answer_bank
    ADD CONSTRAINT game_answer_bank_letter_category_normalized_answer_key UNIQUE (letter, category, normalized_answer);


--
-- Name: game_answer_bank game_answer_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answer_bank
    ADD CONSTRAINT game_answer_bank_pkey PRIMARY KEY (id);


--
-- Name: game_answers game_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answers
    ADD CONSTRAINT game_answers_pkey PRIMARY KEY (id);


--
-- Name: game_answers game_answers_round_id_player_id_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answers
    ADD CONSTRAINT game_answers_round_id_player_id_category_key UNIQUE (round_id, player_id, category);


--
-- Name: game_players game_players_game_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_game_id_user_id_key UNIQUE (game_id, user_id);


--
-- Name: game_players game_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_pkey PRIMARY KEY (id);


--
-- Name: game_point_transactions game_point_transactions_game_type_game_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_point_transactions
    ADD CONSTRAINT game_point_transactions_game_type_game_id_user_id_key UNIQUE (game_type, game_id, user_id);


--
-- Name: game_point_transactions game_point_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_point_transactions
    ADD CONSTRAINT game_point_transactions_pkey PRIMARY KEY (id);


--
-- Name: game_rooms game_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rooms
    ADD CONSTRAINT game_rooms_pkey PRIMARY KEY (id);


--
-- Name: game_rooms game_rooms_room_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rooms
    ADD CONSTRAINT game_rooms_room_code_key UNIQUE (room_code);


--
-- Name: game_rounds game_rounds_game_id_round_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_game_id_round_number_key UNIQUE (game_id, round_number);


--
-- Name: game_rounds game_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_pkey PRIMARY KEY (id);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: group_poll_options group_poll_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_options
    ADD CONSTRAINT group_poll_options_pkey PRIMARY KEY (id);


--
-- Name: group_poll_votes group_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_votes
    ADD CONSTRAINT group_poll_votes_pkey PRIMARY KEY (poll_id, option_id, user_id);


--
-- Name: group_polls group_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_polls
    ADD CONSTRAINT group_polls_pkey PRIMARY KEY (id);


--
-- Name: location_shares location_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_shares
    ADD CONSTRAINT location_shares_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_attempts payment_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);


--
-- Name: payment_attempts payment_attempts_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_reference_key UNIQUE (reference);


--
-- Name: player_game_stats player_game_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_pkey PRIMARY KEY (user_id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_user_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_user_id_label_key UNIQUE (user_id, label);


--
-- Name: split_chat_messages split_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_chat_messages
    ADD CONSTRAINT split_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: split_expense_shares split_expense_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expense_shares
    ADD CONSTRAINT split_expense_shares_pkey PRIMARY KEY (expense_id, user_id);


--
-- Name: split_expenses split_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expenses
    ADD CONSTRAINT split_expenses_pkey PRIMARY KEY (id);


--
-- Name: split_groups split_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_groups
    ADD CONSTRAINT split_groups_pkey PRIMARY KEY (id);


--
-- Name: split_groups split_groups_rid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_groups
    ADD CONSTRAINT split_groups_rid_key UNIQUE (rid);


--
-- Name: split_locations split_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_locations
    ADD CONSTRAINT split_locations_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: split_members split_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_members
    ADD CONSTRAINT split_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: split_planned_spots split_planned_spots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_planned_spots
    ADD CONSTRAINT split_planned_spots_pkey PRIMARY KEY (id);


--
-- Name: split_settlements split_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_settlements
    ADD CONSTRAINT split_settlements_pkey PRIMARY KEY (id);


--
-- Name: throw_alerts throw_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_alerts
    ADD CONSTRAINT throw_alerts_pkey PRIMARY KEY (id);


--
-- Name: throw_profiles throw_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_profiles
    ADD CONSTRAINT throw_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: throw_stories throw_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_stories
    ADD CONSTRAINT throw_stories_pkey PRIMARY KEY (id);


--
-- Name: throw_story_views throw_story_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_story_views
    ADD CONSTRAINT throw_story_views_pkey PRIMARY KEY (id);


--
-- Name: throw_story_views throw_story_views_story_id_viewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_story_views
    ADD CONSTRAINT throw_story_views_story_id_viewer_id_key UNIQUE (story_id, viewer_id);


--
-- Name: throw_streaks throw_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_streaks
    ADD CONSTRAINT throw_streaks_pkey PRIMARY KEY (user_id, counterpart_id);


--
-- Name: throws throws_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throws
    ADD CONSTRAINT throws_pkey PRIMARY KEY (id);


--
-- Name: trivia_answers trivia_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_pkey PRIMARY KEY (id);


--
-- Name: trivia_answers trivia_answers_question_id_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_question_id_player_id_key UNIQUE (question_id, player_id);


--
-- Name: trivia_correct_answers trivia_correct_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_correct_answers
    ADD CONSTRAINT trivia_correct_answers_pkey PRIMARY KEY (question_id);


--
-- Name: trivia_games trivia_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_games
    ADD CONSTRAINT trivia_games_pkey PRIMARY KEY (id);


--
-- Name: trivia_games trivia_games_room_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_games
    ADD CONSTRAINT trivia_games_room_code_key UNIQUE (room_code);


--
-- Name: trivia_players trivia_players_game_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_players
    ADD CONSTRAINT trivia_players_game_id_user_id_key UNIQUE (game_id, user_id);


--
-- Name: trivia_players trivia_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_players
    ADD CONSTRAINT trivia_players_pkey PRIMARY KEY (id);


--
-- Name: trivia_questions trivia_questions_game_id_question_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_game_id_question_index_key UNIQUE (game_id, question_index);


--
-- Name: trivia_questions trivia_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_pkey PRIMARY KEY (id);


--
-- Name: user_last_seen user_last_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_last_seen
    ADD CONSTRAINT user_last_seen_pkey PRIMARY KEY (user_id);


--
-- Name: user_payment_profiles user_payment_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_payment_profiles
    ADD CONSTRAINT user_payment_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_payment_profiles user_payment_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_payment_profiles
    ADD CONSTRAINT user_payment_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: chat_group_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_group_members_user_id_idx ON public.chat_group_members USING btree (user_id);


--
-- Name: direct_messages_connection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX direct_messages_connection_idx ON public.direct_messages USING btree (connection_id, created_at);


--
-- Name: friend_connections_addressee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friend_connections_addressee_idx ON public.friend_connections USING btree (addressee_id, status);


--
-- Name: friend_connections_pair_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX friend_connections_pair_key ON public.friend_connections USING btree (user_lo, user_hi);


--
-- Name: friend_connections_requester_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friend_connections_requester_idx ON public.friend_connections USING btree (requester_id, status);


--
-- Name: game_answer_bank_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_answer_bank_lookup_idx ON public.game_answer_bank USING btree (letter, category, normalized_answer);


--
-- Name: game_answers_round_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_answers_round_id_idx ON public.game_answers USING btree (round_id);


--
-- Name: game_players_game_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_players_game_id_idx ON public.game_players USING btree (game_id);


--
-- Name: game_point_transactions_game_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_point_transactions_game_type_idx ON public.game_point_transactions USING btree (game_type);


--
-- Name: game_point_transactions_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_point_transactions_user_id_created_at_idx ON public.game_point_transactions USING btree (user_id, created_at DESC);


--
-- Name: game_rounds_game_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_rounds_game_id_idx ON public.game_rounds USING btree (game_id);


--
-- Name: group_messages_group_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_messages_group_id_created_at_idx ON public.group_messages USING btree (group_id, created_at);


--
-- Name: group_poll_options_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_poll_options_group_id_idx ON public.group_poll_options USING btree (group_id);


--
-- Name: group_poll_options_poll_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_poll_options_poll_id_idx ON public.group_poll_options USING btree (poll_id);


--
-- Name: group_poll_votes_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_poll_votes_group_id_idx ON public.group_poll_votes USING btree (group_id);


--
-- Name: group_polls_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_polls_group_id_idx ON public.group_polls USING btree (group_id);


--
-- Name: group_polls_pending_rename_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_polls_pending_rename_idx ON public.group_polls USING btree (expires_at) WHERE ((purpose = 'rename'::text) AND (resolved = false));


--
-- Name: notifications_user_dedupe_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_user_dedupe_key_idx ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: notifications_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: payment_attempts_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_attempts_active_unique ON public.payment_attempts USING btree (split_id, payer_user_id, recipient_user_id) WHERE (status = ANY (ARRAY['initiated'::text, 'processing'::text, 'pending'::text]));


--
-- Name: payment_attempts_payer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_attempts_payer_idx ON public.payment_attempts USING btree (payer_user_id, created_at DESC);


--
-- Name: payment_attempts_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_attempts_recipient_idx ON public.payment_attempts USING btree (recipient_user_id, created_at DESC);


--
-- Name: payment_attempts_split_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_attempts_split_idx ON public.payment_attempts USING btree (split_id);


--
-- Name: rooms_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_user_id_idx ON public.rooms USING btree (user_id);


--
-- Name: throw_alerts_next_trigger_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX throw_alerts_next_trigger_at_idx ON public.throw_alerts USING btree (next_trigger_at);


--
-- Name: throw_alerts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX throw_alerts_user_id_idx ON public.throw_alerts USING btree (user_id);


--
-- Name: throw_stories_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX throw_stories_user_created_idx ON public.throw_stories USING btree (user_id, created_at DESC);


--
-- Name: throws_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX throws_recipient_idx ON public.throws USING btree (recipient_id, created_at DESC);


--
-- Name: throws_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX throws_sender_idx ON public.throws USING btree (sender_id, created_at DESC);


--
-- Name: trivia_answers_question_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trivia_answers_question_id_idx ON public.trivia_answers USING btree (question_id);


--
-- Name: trivia_players_game_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trivia_players_game_id_idx ON public.trivia_players USING btree (game_id);


--
-- Name: trivia_questions_game_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trivia_questions_game_id_idx ON public.trivia_questions USING btree (game_id);


--
-- Name: direct_messages direct_messages_link_throw; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER direct_messages_link_throw BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.direct_messages_link_throw();


--
-- Name: location_shares location_shares_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER location_shares_touch_updated_at BEFORE UPDATE ON public.location_shares FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();


--
-- Name: payment_attempts payment_attempts_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_attempts_touch_updated_at BEFORE UPDATE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();


--
-- Name: throw_profiles throw_profiles_default_visibility; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER throw_profiles_default_visibility BEFORE INSERT ON public.throw_profiles FOR EACH ROW EXECUTE FUNCTION public.throw_profiles_default_visibility();


--
-- Name: direct_messages trg_notify_chat_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_chat_message AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message();


--
-- Name: throw_stories trg_notify_status_posted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_status_posted AFTER INSERT ON public.throw_stories FOR EACH ROW EXECUTE FUNCTION public.notify_status_posted();


--
-- Name: user_last_seen user_last_seen_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_last_seen_touch_updated_at BEFORE UPDATE ON public.user_last_seen FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();


--
-- Name: user_payment_profiles user_payment_profiles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_payment_profiles_touch_updated_at BEFORE UPDATE ON public.user_payment_profiles FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();


--
-- Name: budget_cards budget_cards_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_cards
    ADD CONSTRAINT budget_cards_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: card_expenses card_expenses_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_expenses
    ADD CONSTRAINT card_expenses_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.budget_cards(id) ON DELETE CASCADE;


--
-- Name: card_expenses card_expenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_expenses
    ADD CONSTRAINT card_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: card_members card_members_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_members
    ADD CONSTRAINT card_members_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.budget_cards(id) ON DELETE CASCADE;


--
-- Name: card_members card_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_members
    ADD CONSTRAINT card_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: card_topups card_topups_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_topups
    ADD CONSTRAINT card_topups_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.budget_cards(id) ON DELETE CASCADE;


--
-- Name: card_topups card_topups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_topups
    ADD CONSTRAINT card_topups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_group_members chat_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_group_members chat_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_groups chat_groups_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: direct_message_reads direct_message_reads_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_message_reads
    ADD CONSTRAINT direct_message_reads_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.friend_connections(id) ON DELETE CASCADE;


--
-- Name: direct_message_reads direct_message_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_message_reads
    ADD CONSTRAINT direct_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.friend_connections(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_throw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_throw_id_fkey FOREIGN KEY (throw_id) REFERENCES public.throws(id) ON DELETE SET NULL;


--
-- Name: friend_connections friend_connections_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_connections
    ADD CONSTRAINT friend_connections_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_connections friend_connections_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_connections
    ADD CONSTRAINT friend_connections_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);


--
-- Name: friend_connections friend_connections_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_connections
    ADD CONSTRAINT friend_connections_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: game_answers game_answers_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answers
    ADD CONSTRAINT game_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;


--
-- Name: game_answers game_answers_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_answers
    ADD CONSTRAINT game_answers_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.game_rounds(id) ON DELETE CASCADE;


--
-- Name: game_players game_players_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.game_rooms(id) ON DELETE CASCADE;


--
-- Name: game_players game_players_submitted_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_submitted_round_id_fkey FOREIGN KEY (submitted_round_id) REFERENCES public.game_rounds(id) ON DELETE SET NULL;


--
-- Name: game_players game_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: game_point_transactions game_point_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_point_transactions
    ADD CONSTRAINT game_point_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: game_rooms game_rooms_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rooms
    ADD CONSTRAINT game_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: game_rounds game_rounds_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.game_rooms(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.group_polls(id) ON DELETE SET NULL;


--
-- Name: group_messages group_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_poll_options group_poll_options_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_options
    ADD CONSTRAINT group_poll_options_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: group_poll_options group_poll_options_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_options
    ADD CONSTRAINT group_poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.group_polls(id) ON DELETE CASCADE;


--
-- Name: group_poll_votes group_poll_votes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_votes
    ADD CONSTRAINT group_poll_votes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: group_poll_votes group_poll_votes_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_votes
    ADD CONSTRAINT group_poll_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.group_poll_options(id) ON DELETE CASCADE;


--
-- Name: group_poll_votes group_poll_votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_votes
    ADD CONSTRAINT group_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.group_polls(id) ON DELETE CASCADE;


--
-- Name: group_poll_votes group_poll_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_poll_votes
    ADD CONSTRAINT group_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_polls group_polls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_polls
    ADD CONSTRAINT group_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_polls group_polls_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_polls
    ADD CONSTRAINT group_polls_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: location_shares location_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_shares
    ADD CONSTRAINT location_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_related_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_attempts payment_attempts_payer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_payer_user_id_fkey FOREIGN KEY (payer_user_id) REFERENCES auth.users(id);


--
-- Name: payment_attempts payment_attempts_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id);


--
-- Name: payment_attempts payment_attempts_split_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_split_id_fkey FOREIGN KEY (split_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: player_game_stats player_game_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_game_stats
    ADD CONSTRAINT player_game_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_chat_messages split_chat_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_chat_messages
    ADD CONSTRAINT split_chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_chat_messages split_chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_chat_messages
    ADD CONSTRAINT split_chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_expense_shares split_expense_shares_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expense_shares
    ADD CONSTRAINT split_expense_shares_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.split_expenses(id) ON DELETE CASCADE;


--
-- Name: split_expense_shares split_expense_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expense_shares
    ADD CONSTRAINT split_expense_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_expenses split_expenses_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expenses
    ADD CONSTRAINT split_expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_expenses split_expenses_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_expenses
    ADD CONSTRAINT split_expenses_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_groups split_groups_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_groups
    ADD CONSTRAINT split_groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_locations split_locations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_locations
    ADD CONSTRAINT split_locations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_locations split_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_locations
    ADD CONSTRAINT split_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_members split_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_members
    ADD CONSTRAINT split_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_members split_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_members
    ADD CONSTRAINT split_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_planned_spots split_planned_spots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_planned_spots
    ADD CONSTRAINT split_planned_spots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: split_planned_spots split_planned_spots_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_planned_spots
    ADD CONSTRAINT split_planned_spots_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_settlements split_settlements_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_settlements
    ADD CONSTRAINT split_settlements_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: split_settlements split_settlements_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_settlements
    ADD CONSTRAINT split_settlements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.split_groups(id) ON DELETE CASCADE;


--
-- Name: split_settlements split_settlements_payment_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_settlements
    ADD CONSTRAINT split_settlements_payment_attempt_id_fkey FOREIGN KEY (payment_attempt_id) REFERENCES public.payment_attempts(id) ON DELETE SET NULL;


--
-- Name: split_settlements split_settlements_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_settlements
    ADD CONSTRAINT split_settlements_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throw_alerts throw_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_alerts
    ADD CONSTRAINT throw_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throw_profiles throw_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_profiles
    ADD CONSTRAINT throw_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throw_stories throw_stories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_stories
    ADD CONSTRAINT throw_stories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throw_story_views throw_story_views_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_story_views
    ADD CONSTRAINT throw_story_views_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.throw_stories(id) ON DELETE CASCADE;


--
-- Name: throw_story_views throw_story_views_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_story_views
    ADD CONSTRAINT throw_story_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throw_streaks throw_streaks_counterpart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_streaks
    ADD CONSTRAINT throw_streaks_counterpart_id_fkey FOREIGN KEY (counterpart_id) REFERENCES auth.users(id);


--
-- Name: throw_streaks throw_streaks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throw_streaks
    ADD CONSTRAINT throw_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throws throws_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throws
    ADD CONSTRAINT throws_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: throws throws_replied_to_throw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throws
    ADD CONSTRAINT throws_replied_to_throw_id_fkey FOREIGN KEY (replied_to_throw_id) REFERENCES public.throws(id) ON DELETE SET NULL;


--
-- Name: throws throws_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.throws
    ADD CONSTRAINT throws_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: trivia_answers trivia_answers_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.trivia_games(id);


--
-- Name: trivia_answers trivia_answers_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.trivia_players(id);


--
-- Name: trivia_answers trivia_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_answers
    ADD CONSTRAINT trivia_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.trivia_questions(id);


--
-- Name: trivia_correct_answers trivia_correct_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_correct_answers
    ADD CONSTRAINT trivia_correct_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.trivia_questions(id);


--
-- Name: trivia_players trivia_players_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_players
    ADD CONSTRAINT trivia_players_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.trivia_games(id);


--
-- Name: trivia_questions trivia_questions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trivia_questions
    ADD CONSTRAINT trivia_questions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.trivia_games(id);


--
-- Name: user_last_seen user_last_seen_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_last_seen
    ADD CONSTRAINT user_last_seen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_payment_profiles user_payment_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_payment_profiles
    ADD CONSTRAINT user_payment_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: card_members Card owners and members view the full roster; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Card owners and members view the full roster" ON public.card_members FOR SELECT USING ((private.is_card_owner(card_id, auth.uid()) OR private.is_card_member(card_id, auth.uid())));


--
-- Name: direct_messages Connection parties can clear their thread; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Connection parties can clear their thread" ON public.direct_messages FOR DELETE USING (private.is_connection_party(connection_id, auth.uid()));


--
-- Name: direct_messages Connection parties send messages once accepted; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Connection parties send messages once accepted" ON public.direct_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND private.is_connection_party(connection_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.friend_connections
  WHERE ((friend_connections.id = direct_messages.connection_id) AND (friend_connections.status = 'accepted'::text))))));


--
-- Name: direct_messages Connection parties view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Connection parties view messages" ON public.direct_messages FOR SELECT USING (private.is_connection_party(connection_id, auth.uid()));


--
-- Name: split_planned_spots Creator or owner delete spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator or owner delete spots" ON public.split_planned_spots FOR DELETE USING (((created_by = auth.uid()) OR private.is_split_owner(group_id, auth.uid())));


--
-- Name: split_planned_spots Creator or owner update spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator or owner update spots" ON public.split_planned_spots FOR UPDATE USING (((created_by = auth.uid()) OR private.is_split_owner(group_id, auth.uid()))) WITH CHECK (((created_by = auth.uid()) OR private.is_split_owner(group_id, auth.uid())));


--
-- Name: user_payment_profiles Insert own payment profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert own payment profile" ON public.user_payment_profiles FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (upi_verified = false)));


--
-- Name: location_shares Insert own share; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert own share" ON public.location_shares FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: card_members Members and owners remove membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and owners remove membership" ON public.card_members FOR DELETE USING (((user_id = auth.uid()) OR private.is_card_owner(card_id, auth.uid())));


--
-- Name: split_members Members and owners remove membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and owners remove membership" ON public.split_members FOR DELETE USING (((user_id = auth.uid()) OR private.is_split_owner(group_id, auth.uid())));


--
-- Name: split_members Members and owners view membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and owners view membership" ON public.split_members FOR SELECT USING (((user_id = auth.uid()) OR private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: card_expenses Owners and members add expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add expenses" ON public.card_expenses FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (private.is_card_owner(card_id, auth.uid()) OR private.is_card_member(card_id, auth.uid()))));


--
-- Name: split_expenses Owners and members add expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add expenses" ON public.split_expenses FOR INSERT WITH CHECK (((paid_by = auth.uid()) AND (private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid()))));


--
-- Name: split_settlements Owners and members add settlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add settlements" ON public.split_settlements FOR INSERT WITH CHECK (((from_user_id = auth.uid()) AND (private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid()))));


--
-- Name: split_expense_shares Owners and members add shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add shares" ON public.split_expense_shares FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.split_expenses e
  WHERE ((e.id = split_expense_shares.expense_id) AND (private.is_split_owner(e.group_id, auth.uid()) OR private.is_split_member(e.group_id, auth.uid()))))));


--
-- Name: split_planned_spots Owners and members add spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add spots" ON public.split_planned_spots FOR INSERT WITH CHECK (((created_by = auth.uid()) AND (private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid()))));


--
-- Name: card_topups Owners and members add topups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members add topups" ON public.card_topups FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (private.is_card_owner(card_id, auth.uid()) OR private.is_card_member(card_id, auth.uid()))));


--
-- Name: split_chat_messages Owners and members send chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members send chat" ON public.split_chat_messages FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid()))));


--
-- Name: budget_cards Owners and members update cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members update cards" ON public.budget_cards FOR UPDATE USING (((owner_id = auth.uid()) OR private.is_card_member(id, auth.uid()))) WITH CHECK (((owner_id = auth.uid()) OR private.is_card_member(id, auth.uid())));


--
-- Name: budget_cards Owners and members view cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view cards" ON public.budget_cards FOR SELECT USING (((owner_id = auth.uid()) OR private.is_card_member(id, auth.uid())));


--
-- Name: split_chat_messages Owners and members view chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view chat" ON public.split_chat_messages FOR SELECT USING ((private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: card_expenses Owners and members view expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view expenses" ON public.card_expenses FOR SELECT USING ((private.is_card_owner(card_id, auth.uid()) OR private.is_card_member(card_id, auth.uid())));


--
-- Name: split_expenses Owners and members view expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view expenses" ON public.split_expenses FOR SELECT USING ((private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: split_groups Owners and members view groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view groups" ON public.split_groups FOR SELECT USING (((owner_id = auth.uid()) OR private.is_split_member(id, auth.uid())));


--
-- Name: split_locations Owners and members view locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view locations" ON public.split_locations FOR SELECT USING ((private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: split_settlements Owners and members view settlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view settlements" ON public.split_settlements FOR SELECT USING ((private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: split_expense_shares Owners and members view shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view shares" ON public.split_expense_shares FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.split_expenses e
  WHERE ((e.id = split_expense_shares.expense_id) AND (private.is_split_owner(e.group_id, auth.uid()) OR private.is_split_member(e.group_id, auth.uid()))))));


--
-- Name: split_planned_spots Owners and members view spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view spots" ON public.split_planned_spots FOR SELECT USING ((private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid())));


--
-- Name: card_topups Owners and members view topups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and members view topups" ON public.card_topups FOR SELECT USING ((private.is_card_owner(card_id, auth.uid()) OR private.is_card_member(card_id, auth.uid())));


--
-- Name: budget_cards Owners create cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners create cards" ON public.budget_cards FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: split_groups Owners create groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners create groups" ON public.split_groups FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: budget_cards Owners delete cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners delete cards" ON public.budget_cards FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: card_expenses Owners delete expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners delete expenses" ON public.card_expenses FOR DELETE USING (private.is_card_owner(card_id, auth.uid()));


--
-- Name: split_expenses Owners delete expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners delete expenses" ON public.split_expenses FOR DELETE USING (private.is_split_owner(group_id, auth.uid()));


--
-- Name: split_groups Owners delete groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners delete groups" ON public.split_groups FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: card_topups Owners delete topups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners delete topups" ON public.card_topups FOR DELETE USING (private.is_card_owner(card_id, auth.uid()));


--
-- Name: split_groups Owners update groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners update groups" ON public.split_groups FOR UPDATE USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: user_last_seen Update own last seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own last seen" ON public.user_last_seen FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_payment_profiles Update own payment profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own payment profile" ON public.user_payment_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (upi_verified = false)));


--
-- Name: location_shares Update own share; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update own share" ON public.location_shares FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_last_seen Upsert own last seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Upsert own last seen" ON public.user_last_seen FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: rooms Users manage own rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own rooms" ON public.rooms USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_settings Users manage own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own settings" ON public.user_settings USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: split_locations Users update own location; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own location" ON public.split_locations FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: split_locations Users upsert own location; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users upsert own location" ON public.split_locations FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (private.is_split_owner(group_id, auth.uid()) OR private.is_split_member(group_id, auth.uid()))));


--
-- Name: friend_connections View own friend connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own friend connections" ON public.friend_connections FOR SELECT USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: user_payment_profiles View own or co-member payment profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or co-member payment profiles" ON public.user_payment_profiles FOR SELECT USING (((user_id = auth.uid()) OR private.shares_split_group(user_id, auth.uid()) OR private.is_accepted_friend(user_id, auth.uid())));


--
-- Name: location_shares View own or friends' active shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or friends' active shares" ON public.location_shares FOR SELECT USING (((user_id = auth.uid()) OR private.is_accepted_friend(user_id, auth.uid())));


--
-- Name: user_last_seen View own or friends' last seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own or friends' last seen" ON public.user_last_seen FOR SELECT USING (((user_id = auth.uid()) OR private.is_accepted_friend(user_id, auth.uid())));


--
-- Name: payment_attempts View own payment attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View own payment attempts" ON public.payment_attempts FOR SELECT USING (((payer_user_id = auth.uid()) OR (recipient_user_id = auth.uid())));


--
-- Name: budget_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: card_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: card_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_members ENABLE ROW LEVEL SECURITY;

--
-- Name: card_topups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_topups ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_alerts delete own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete own alerts" ON public.throw_alerts FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: direct_message_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_message_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: direct_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friend_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: game_answer_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_answer_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: game_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: game_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

--
-- Name: game_point_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_point_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: game_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: game_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: group_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: group_poll_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_poll_options ENABLE ROW LEVEL SECURITY;

--
-- Name: group_poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: group_polls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_polls ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_alerts insert own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own alerts" ON public.throw_alerts FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: location_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: group_polls members can create polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can create polls" ON public.group_polls FOR INSERT WITH CHECK ((private.is_chat_group_member(group_id, auth.uid()) AND (created_by = auth.uid())));


--
-- Name: group_messages members can send group messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can send group messages" ON public.group_messages FOR INSERT WITH CHECK ((private.is_chat_group_member(group_id, auth.uid()) AND (sender_id = auth.uid())));


--
-- Name: chat_group_members members can view group membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view group membership" ON public.chat_group_members FOR SELECT USING (private.is_chat_group_member(group_id, auth.uid()));


--
-- Name: group_messages members can view group messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view group messages" ON public.group_messages FOR SELECT USING (private.is_chat_group_member(group_id, auth.uid()));


--
-- Name: group_poll_options members can view poll options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view poll options" ON public.group_poll_options FOR SELECT USING (private.is_chat_group_member(group_id, auth.uid()));


--
-- Name: group_polls members can view polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view polls" ON public.group_polls FOR SELECT USING (private.is_chat_group_member(group_id, auth.uid()));


--
-- Name: group_poll_votes members can view votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can view votes" ON public.group_poll_votes FOR SELECT USING (private.is_chat_group_member(group_id, auth.uid()));


--
-- Name: group_poll_votes members can vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members can vote" ON public.group_poll_votes FOR INSERT WITH CHECK (((user_id = auth.uid()) AND private.is_chat_group_member(group_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.group_polls p
  WHERE ((p.id = group_poll_votes.poll_id) AND (p.group_id = group_poll_votes.group_id))))));


--
-- Name: chat_groups members or owner can view their groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members or owner can view their groups" ON public.chat_groups FOR SELECT USING (((owner_id = auth.uid()) OR private.is_chat_group_member(id, auth.uid())));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_group_members owner can add members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can add members" ON public.chat_group_members FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.chat_groups g
  WHERE ((g.id = chat_group_members.group_id) AND (g.owner_id = auth.uid())))));


--
-- Name: chat_groups owner can create a group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can create a group" ON public.chat_groups FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: chat_groups owner can delete their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can delete their group" ON public.chat_groups FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: chat_groups owner can update their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can update their group" ON public.chat_groups FOR UPDATE USING ((owner_id = auth.uid()));


--
-- Name: chat_group_members owner or self can remove membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or self can remove membership" ON public.chat_group_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_groups g
  WHERE ((g.id = chat_group_members.group_id) AND (g.owner_id = auth.uid()))))));


--
-- Name: payment_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: player_game_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: group_poll_options poll creator can add options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "poll creator can add options" ON public.group_poll_options FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.group_polls p
  WHERE ((p.id = group_poll_options.poll_id) AND (p.created_by = auth.uid()) AND (p.group_id = group_poll_options.group_id)))));


--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: game_answer_bank select answer bank; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select answer bank" ON public.game_answer_bank FOR SELECT USING (true);


--
-- Name: trivia_questions select current or past trivia questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select current or past trivia questions" ON public.trivia_questions FOR SELECT USING ((private.is_trivia_player(game_id, auth.uid()) AND (question_index <= ( SELECT g.current_question_index
   FROM public.trivia_games g
  WHERE (g.id = trivia_questions.game_id)))));


--
-- Name: game_players select fellow players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select fellow players" ON public.game_players FOR SELECT USING (private.is_game_player(game_id, auth.uid()));


--
-- Name: trivia_players select fellow trivia players; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select fellow trivia players" ON public.trivia_players FOR SELECT USING (private.is_trivia_player(game_id, auth.uid()));


--
-- Name: throw_alerts select own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own alerts" ON public.throw_alerts FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: game_point_transactions select own or friend's game point transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or friend's game point transactions" ON public.game_point_transactions FOR SELECT USING (((auth.uid() = user_id) OR private.is_accepted_friend(user_id, auth.uid())));


--
-- Name: player_game_stats select own or friend's game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or friend's game stats" ON public.player_game_stats FOR SELECT USING (((auth.uid() = user_id) OR private.is_accepted_friend(user_id, auth.uid())));


--
-- Name: game_rooms select own or joinable rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or joinable rooms" ON public.game_rooms FOR SELECT USING ((private.is_game_player(id, auth.uid()) OR (status = 'waiting'::text)));


--
-- Name: trivia_games select own or joinable trivia games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or joinable trivia games" ON public.trivia_games FOR SELECT USING ((private.is_trivia_player(id, auth.uid()) OR (status = 'waiting'::text)));


--
-- Name: game_answers select own or revealed answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or revealed answers" ON public.game_answers FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.game_players gp
  WHERE ((gp.id = game_answers.player_id) AND (gp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.game_rounds gr
  WHERE ((gr.id = game_answers.round_id) AND (gr.status = 'results'::text) AND private.is_game_player(gr.game_id, auth.uid()))))));


--
-- Name: trivia_answers select own or revealed trivia answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own or revealed trivia answers" ON public.trivia_answers FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.trivia_players tp
  WHERE ((tp.id = trivia_answers.player_id) AND (tp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.trivia_questions q
  WHERE ((q.id = trivia_answers.question_id) AND (q.status = 'revealed'::text) AND private.is_trivia_player(q.game_id, auth.uid()))))));


--
-- Name: throw_streaks select own throw streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own throw streak" ON public.throw_streaks FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: trivia_correct_answers select revealed correct answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select revealed correct answers" ON public.trivia_correct_answers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trivia_questions q
  WHERE ((q.id = trivia_correct_answers.question_id) AND (q.status = 'revealed'::text) AND private.is_trivia_player(q.game_id, auth.uid())))));


--
-- Name: game_rounds select rounds of my games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select rounds of my games" ON public.game_rounds FOR SELECT USING (private.is_game_player(game_id, auth.uid()));


--
-- Name: split_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: split_expense_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_expense_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: split_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: split_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: split_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: split_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_members ENABLE ROW LEVEL SECURITY;

--
-- Name: split_planned_spots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_planned_spots ENABLE ROW LEVEL SECURITY;

--
-- Name: split_settlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.split_settlements ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throw_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throw_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_profiles throw_profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_profiles_insert ON public.throw_profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: throw_profiles throw_profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_profiles_select ON public.throw_profiles FOR SELECT USING (((user_id = auth.uid()) OR (location_visibility = 'all'::text) OR ((location_visibility = 'friends'::text) AND (EXISTS ( SELECT 1
   FROM public.friend_connections fc
  WHERE ((fc.status = 'accepted'::text) AND (((fc.requester_id = auth.uid()) AND (fc.addressee_id = throw_profiles.user_id)) OR ((fc.addressee_id = auth.uid()) AND (fc.requester_id = throw_profiles.user_id)))))))));


--
-- Name: throw_profiles throw_profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_profiles_update ON public.throw_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: throw_stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throw_stories ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_stories throw_stories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_stories_delete ON public.throw_stories FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: throw_stories throw_stories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_stories_insert ON public.throw_stories FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: throw_stories throw_stories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_stories_select ON public.throw_stories FOR SELECT USING (((created_at > (now() - '24:00:00'::interval)) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.friend_connections fc
  WHERE ((fc.status = 'accepted'::text) AND (((fc.requester_id = auth.uid()) AND (fc.addressee_id = throw_stories.user_id)) OR ((fc.addressee_id = auth.uid()) AND (fc.requester_id = throw_stories.user_id)))))))));


--
-- Name: throw_story_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throw_story_views ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_story_views throw_story_views_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_story_views_insert ON public.throw_story_views FOR INSERT WITH CHECK ((viewer_id = auth.uid()));


--
-- Name: throw_story_views throw_story_views_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throw_story_views_select ON public.throw_story_views FOR SELECT USING (((viewer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.throw_stories s
  WHERE ((s.id = throw_story_views.story_id) AND (s.user_id = auth.uid()))))));


--
-- Name: throw_streaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throw_streaks ENABLE ROW LEVEL SECURITY;

--
-- Name: throws; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.throws ENABLE ROW LEVEL SECURITY;

--
-- Name: throws throws_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY throws_select ON public.throws FOR SELECT USING (((sender_id = auth.uid()) OR (recipient_id = auth.uid())));


--
-- Name: trivia_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trivia_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: trivia_correct_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trivia_correct_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: trivia_games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trivia_games ENABLE ROW LEVEL SECURITY;

--
-- Name: trivia_players; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trivia_players ENABLE ROW LEVEL SECURITY;

--
-- Name: trivia_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: throw_alerts update own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update own alerts" ON public.throw_alerts FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: group_poll_votes user can remove own vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user can remove own vote" ON public.group_poll_votes FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: user_last_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_last_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: user_payment_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_payment_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION is_card_member(p_card_id uuid, p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_card_member(p_card_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_card_member(p_card_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_card_owner(p_card_id uuid, p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_card_owner(p_card_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_card_owner(p_card_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_split_member(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_split_member(p_group_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_split_member(p_group_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_split_owner(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_split_owner(p_group_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_split_owner(p_group_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION shares_card_with(p_target_user_id uuid, p_viewer_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.shares_card_with(p_target_user_id uuid, p_viewer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.shares_card_with(p_target_user_id uuid, p_viewer_id uuid) TO authenticated;


--
-- Name: FUNCTION shares_split_with(p_target_user_id uuid, p_viewer_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.shares_split_with(p_target_user_id uuid, p_viewer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.shares_split_with(p_target_user_id uuid, p_viewer_id uuid) TO authenticated;


--
-- Name: FUNCTION add_split_member(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_split_member(p_group_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_split_member(p_group_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION award_game_points(p_game_type text, p_game_id uuid, p_outcomes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_game_points(p_game_type text, p_game_id uuid, p_outcomes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_game_points(p_game_type text, p_game_id uuid, p_outcomes jsonb) TO service_role;


--
-- Name: FUNCTION check_rename_poll(p_poll_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_rename_poll(p_poll_id uuid) TO authenticated;


--
-- Name: FUNCTION create_game_room(p_rounds integer, p_timer_seconds integer, p_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_game_room(p_rounds integer, p_timer_seconds integer, p_name text) TO authenticated;


--
-- Name: FUNCTION delete_own_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_own_account() TO authenticated;


--
-- Name: FUNCTION delete_own_data(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_own_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_own_data() TO authenticated;


--
-- Name: FUNCTION get_map_locations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_map_locations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_map_locations() TO authenticated;
GRANT ALL ON FUNCTION public.get_map_locations() TO service_role;


--
-- Name: FUNCTION hug_throw(p_throw_id uuid, p_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hug_throw(p_throw_id uuid, p_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hug_throw(p_throw_id uuid, p_count integer) TO authenticated;


--
-- Name: FUNCTION join_budget_card(p_rid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_budget_card(p_rid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_budget_card(p_rid text) TO authenticated;


--
-- Name: FUNCTION join_game_room(p_room_code text, p_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.join_game_room(p_room_code text, p_name text) TO authenticated;


--
-- Name: FUNCTION join_split_group(p_rid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_split_group(p_rid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_split_group(p_rid text) TO authenticated;


--
-- Name: FUNCTION leave_game_room(p_game_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leave_game_room(p_game_id uuid) TO authenticated;


--
-- Name: FUNCTION lock_expired_round(p_round_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.lock_expired_round(p_round_id uuid) TO authenticated;


--
-- Name: FUNCTION mark_throw_read(p_throw_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_throw_read(p_throw_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_throw_read(p_throw_id uuid) TO authenticated;


--
-- Name: FUNCTION notify_card_expense_activity(p_card_id uuid, p_expense_title text, p_amount numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_card_expense_activity(p_card_id uuid, p_expense_title text, p_amount numeric) TO authenticated;


--
-- Name: FUNCTION notify_split_expense_activity(p_group_id uuid, p_expense_title text, p_amount numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_split_expense_activity(p_group_id uuid, p_expense_title text, p_amount numeric) TO authenticated;


--
-- Name: FUNCTION set_ready(p_game_id uuid, p_ready boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_ready(p_game_id uuid, p_ready boolean) TO authenticated;


--
-- Name: FUNCTION start_round(p_game_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_round(p_game_id uuid) TO authenticated;


--
-- Name: FUNCTION submit_round_answers(p_round_id uuid, p_answers jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_round_answers(p_round_id uuid, p_answers jsonb) TO authenticated;


--
-- Name: FUNCTION unblock_friend_connection(p_connection_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unblock_friend_connection(p_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unblock_friend_connection(p_connection_id uuid) TO authenticated;


--
-- PostgreSQL database dump complete
--



-- exact privileges as on the live MySpace database
REVOKE ALL ON TABLE public.throw_streaks FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_streaks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_streaks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_streaks TO service_role;
REVOKE ALL ON TABLE public.card_expenses FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_expenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_expenses TO service_role;
REVOKE ALL ON TABLE public.card_members FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_members TO service_role;
REVOKE ALL ON TABLE public.budget_cards FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_cards TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_cards TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_cards TO service_role;
REVOKE ALL ON TABLE public.rooms FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO service_role;
REVOKE ALL ON TABLE public.game_rooms FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_rooms TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_rooms TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_rooms TO service_role;
REVOKE ALL ON TABLE public.game_rounds FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_rounds TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_rounds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_rounds TO service_role;
REVOKE ALL ON TABLE public.game_answers FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_answers TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_answers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_answers TO service_role;
REVOKE ALL ON TABLE public.game_answer_bank FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_answer_bank TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_answer_bank TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_answer_bank TO service_role;
REVOKE ALL ON TABLE public.game_players FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_players TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_players TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_players TO service_role;
REVOKE ALL ON TABLE public.split_groups FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_groups TO service_role;
REVOKE ALL ON TABLE public.split_members FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_members TO service_role;
REVOKE ALL ON TABLE public.split_expenses FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expenses TO service_role;
REVOKE ALL ON TABLE public.split_expense_shares FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expense_shares TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expense_shares TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_expense_shares TO service_role;
REVOKE ALL ON TABLE public.split_chat_messages FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_chat_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_chat_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_chat_messages TO service_role;
REVOKE ALL ON TABLE public.split_locations FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_locations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_locations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_locations TO service_role;
REVOKE ALL ON TABLE public.split_settlements FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_settlements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_settlements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_settlements TO service_role;
REVOKE ALL ON TABLE public.throw_alerts FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_alerts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_alerts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_alerts TO service_role;
REVOKE ALL ON TABLE public.player_game_stats FROM public, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_game_stats TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.player_game_stats TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.player_game_stats TO service_role;
REVOKE ALL ON TABLE public.group_messages FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_messages TO service_role;
REVOKE ALL ON TABLE public.split_planned_spots FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_planned_spots TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_planned_spots TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.split_planned_spots TO service_role;
REVOKE ALL ON TABLE public.card_topups FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_topups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_topups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.card_topups TO service_role;
REVOKE ALL ON TABLE public.payment_attempts FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO service_role;
REVOKE ALL ON TABLE public.chat_groups FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_groups TO service_role;
REVOKE ALL ON TABLE public.chat_group_members FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_group_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_group_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chat_group_members TO service_role;
REVOKE ALL ON TABLE public.group_poll_options FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_options TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_options TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_options TO service_role;
REVOKE ALL ON TABLE public.group_poll_votes FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_votes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_votes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_poll_votes TO service_role;
REVOKE ALL ON TABLE public.throw_story_views FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_story_views TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_story_views TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_story_views TO service_role;
REVOKE ALL ON TABLE public.notifications FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;
REVOKE ALL ON TABLE public.throw_stories FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_stories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_stories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_stories TO service_role;
REVOKE ALL ON TABLE public.location_shares FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_shares TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_shares TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_shares TO service_role;
REVOKE ALL ON TABLE public.game_point_transactions FROM public, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_point_transactions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.game_point_transactions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.game_point_transactions TO service_role;
REVOKE ALL ON TABLE public.trivia_games FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_games TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_games TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_games TO service_role;
REVOKE ALL ON TABLE public.friend_connections FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.friend_connections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.friend_connections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.friend_connections TO service_role;
REVOKE ALL ON TABLE public.trivia_players FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_players TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_players TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_players TO service_role;
REVOKE ALL ON TABLE public.user_payment_profiles FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_payment_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_payment_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_payment_profiles TO service_role;
REVOKE ALL ON TABLE public.user_last_seen FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_last_seen TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_last_seen TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_last_seen TO service_role;
REVOKE ALL ON TABLE public.direct_message_reads FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_message_reads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_message_reads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_message_reads TO service_role;
REVOKE ALL ON TABLE public.direct_messages FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.direct_messages TO service_role;
REVOKE ALL ON TABLE public.group_polls FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_polls TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_polls TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_polls TO service_role;
REVOKE ALL ON TABLE public.trivia_questions FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_questions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_questions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_questions TO service_role;
REVOKE ALL ON TABLE public.trivia_correct_answers FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_correct_answers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_correct_answers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_correct_answers TO service_role;
REVOKE ALL ON TABLE public.trivia_answers FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_answers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_answers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.trivia_answers TO service_role;
REVOKE ALL ON TABLE public.user_settings FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_settings TO service_role;
REVOKE ALL ON TABLE public.throws FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throws TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throws TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throws TO service_role;
REVOKE ALL ON TABLE public.throw_profiles FROM public, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.throw_profiles TO service_role;
REVOKE ALL ON FUNCTION find_profile_by_friend_code(text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_profile_by_friend_code(text) TO public;
GRANT EXECUTE ON FUNCTION find_profile_by_friend_code(text) TO anon;
GRANT EXECUTE ON FUNCTION find_profile_by_friend_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION find_profile_by_friend_code(text) TO service_role;
REVOKE ALL ON FUNCTION private.is_card_owner(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_card_owner(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_card_owner(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION remove_friend_connection(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION remove_friend_connection(uuid) TO public;
GRANT EXECUTE ON FUNCTION remove_friend_connection(uuid) TO anon;
GRANT EXECUTE ON FUNCTION remove_friend_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_friend_connection(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.is_card_member(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_card_member(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_card_member(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION get_unread_counts() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_unread_counts() TO public;
GRANT EXECUTE ON FUNCTION get_unread_counts() TO anon;
GRANT EXECUTE ON FUNCTION get_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_counts() TO service_role;
REVOKE ALL ON FUNCTION mark_thread_read(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_thread_read(uuid) TO public;
GRANT EXECUTE ON FUNCTION mark_thread_read(uuid) TO anon;
GRANT EXECUTE ON FUNCTION mark_thread_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_thread_read(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.generate_friend_code() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.generate_friend_code() TO public;
REVOKE ALL ON FUNCTION private.shares_card_with(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.shares_card_with(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.set_friend_code() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_friend_code() TO public;
REVOKE ALL ON FUNCTION count_mutual_friends(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_mutual_friends(uuid) TO public;
GRANT EXECUTE ON FUNCTION count_mutual_friends(uuid) TO anon;
GRANT EXECUTE ON FUNCTION count_mutual_friends(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_mutual_friends(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.is_split_owner(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_split_owner(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.is_split_member(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_split_member(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.shares_split_with(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.shares_split_with(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION delete_own_account() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_own_account() TO service_role;
REVOKE ALL ON FUNCTION add_split_member(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_split_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_split_member(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.in_app_pref_enabled(uuid,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.in_app_pref_enabled(uuid,text) TO public;
REVOKE ALL ON FUNCTION notify_card_expense_activity(uuid,text,numeric) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION notify_card_expense_activity(uuid,text,numeric) TO public;
GRANT EXECUTE ON FUNCTION notify_card_expense_activity(uuid,text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION notify_card_expense_activity(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_card_expense_activity(uuid,text,numeric) TO service_role;
REVOKE ALL ON FUNCTION delete_own_data() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_own_data() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_own_data() TO service_role;
REVOKE ALL ON FUNCTION private.is_accepted_friend(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_accepted_friend(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION private.is_connection_party(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_connection_party(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION private.touch_updated_at() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.touch_updated_at() TO public;
REVOKE ALL ON FUNCTION private.shares_split_group(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.shares_split_group(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION verify_own_upi_id() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_own_upi_id() TO public;
GRANT EXECUTE ON FUNCTION verify_own_upi_id() TO anon;
GRANT EXECUTE ON FUNCTION verify_own_upi_id() TO authenticated;
GRANT EXECUTE ON FUNCTION verify_own_upi_id() TO service_role;
REVOKE ALL ON FUNCTION create_upi_payment(uuid,uuid,numeric) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_upi_payment(uuid,uuid,numeric) TO public;
GRANT EXECUTE ON FUNCTION create_upi_payment(uuid,uuid,numeric) TO anon;
GRANT EXECUTE ON FUNCTION create_upi_payment(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION create_upi_payment(uuid,uuid,numeric) TO service_role;
REVOKE ALL ON FUNCTION mark_upi_payment_sent(uuid,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_upi_payment_sent(uuid,text) TO public;
GRANT EXECUTE ON FUNCTION mark_upi_payment_sent(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION mark_upi_payment_sent(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_upi_payment_sent(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION cancel_upi_payment(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_upi_payment(uuid) TO public;
GRANT EXECUTE ON FUNCTION cancel_upi_payment(uuid) TO anon;
GRANT EXECUTE ON FUNCTION cancel_upi_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_upi_payment(uuid) TO service_role;
REVOKE ALL ON FUNCTION nudge_friend_request(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION nudge_friend_request(uuid) TO public;
GRANT EXECUTE ON FUNCTION nudge_friend_request(uuid) TO anon;
GRANT EXECUTE ON FUNCTION nudge_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION nudge_friend_request(uuid) TO service_role;
REVOKE ALL ON FUNCTION join_budget_card(text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION join_budget_card(text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_budget_card(text) TO service_role;
REVOKE ALL ON FUNCTION join_split_group(text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION join_split_group(text) TO anon;
GRANT EXECUTE ON FUNCTION join_split_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_split_group(text) TO service_role;
REVOKE ALL ON FUNCTION notify_split_expense_activity(uuid,text,numeric) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION notify_split_expense_activity(uuid,text,numeric) TO public;
GRANT EXECUTE ON FUNCTION notify_split_expense_activity(uuid,text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION notify_split_expense_activity(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_split_expense_activity(uuid,text,numeric) TO service_role;
REVOKE ALL ON FUNCTION confirm_upi_payment(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_upi_payment(uuid) TO public;
GRANT EXECUTE ON FUNCTION confirm_upi_payment(uuid) TO anon;
GRANT EXECUTE ON FUNCTION confirm_upi_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_upi_payment(uuid) TO service_role;
REVOKE ALL ON FUNCTION remind_upi_setup(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION remind_upi_setup(uuid,uuid) TO public;
GRANT EXECUTE ON FUNCTION remind_upi_setup(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION remind_upi_setup(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remind_upi_setup(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.is_chat_group_member(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_chat_group_member(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION private.finalize_rename_poll(uuid,boolean) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.finalize_rename_poll(uuid,boolean) TO public;
REVOKE ALL ON FUNCTION check_rename_poll(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_rename_poll(uuid) TO public;
GRANT EXECUTE ON FUNCTION check_rename_poll(uuid) TO anon;
GRANT EXECUTE ON FUNCTION check_rename_poll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rename_poll(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.sweep_expired_rename_polls() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.sweep_expired_rename_polls() TO public;
REVOKE ALL ON FUNCTION private.shares_chat_group_with(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.shares_chat_group_with(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION private.is_game_player(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_game_player(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION create_game_room(integer,integer,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_game_room(integer,integer,text) TO public;
GRANT EXECUTE ON FUNCTION create_game_room(integer,integer,text) TO anon;
GRANT EXECUTE ON FUNCTION create_game_room(integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_game_room(integer,integer,text) TO service_role;
REVOKE ALL ON FUNCTION leave_game_room(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION leave_game_room(uuid) TO public;
GRANT EXECUTE ON FUNCTION leave_game_room(uuid) TO anon;
GRANT EXECUTE ON FUNCTION leave_game_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_game_room(uuid) TO service_role;
REVOKE ALL ON FUNCTION join_game_room(text,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION join_game_room(text,text) TO public;
GRANT EXECUTE ON FUNCTION join_game_room(text,text) TO anon;
GRANT EXECUTE ON FUNCTION join_game_room(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_game_room(text,text) TO service_role;
REVOKE ALL ON FUNCTION set_ready(uuid,boolean) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_ready(uuid,boolean) TO public;
GRANT EXECUTE ON FUNCTION set_ready(uuid,boolean) TO anon;
GRANT EXECUTE ON FUNCTION set_ready(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION set_ready(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION lock_expired_round(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION lock_expired_round(uuid) TO public;
GRANT EXECUTE ON FUNCTION lock_expired_round(uuid) TO anon;
GRANT EXECUTE ON FUNCTION lock_expired_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_expired_round(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.build_shuffled_deck() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.build_shuffled_deck() TO public;
REVOKE ALL ON FUNCTION private.ensure_draw_pile(uuid,integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ensure_draw_pile(uuid,integer) TO public;
REVOKE ALL ON FUNCTION private.force_draw_player(uuid,uuid,integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.force_draw_player(uuid,uuid,integer) TO public;
REVOKE ALL ON FUNCTION award_game_points(text,uuid,jsonb) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION award_game_points(text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION submit_round_answers(uuid,jsonb) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_round_answers(uuid,jsonb) TO public;
GRANT EXECUTE ON FUNCTION submit_round_answers(uuid,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION submit_round_answers(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_round_answers(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.pick_npat_letter(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pick_npat_letter(uuid) TO public;
REVOKE ALL ON FUNCTION start_round(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_round(uuid) TO public;
GRANT EXECUTE ON FUNCTION start_round(uuid) TO anon;
GRANT EXECUTE ON FUNCTION start_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION start_round(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.is_trivia_player(uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_trivia_player(uuid,uuid) TO public;
REVOKE ALL ON FUNCTION create_trivia_game(text,text,integer,integer,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_trivia_game(text,text,integer,integer,text) TO public;
GRANT EXECUTE ON FUNCTION create_trivia_game(text,text,integer,integer,text) TO anon;
GRANT EXECUTE ON FUNCTION create_trivia_game(text,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_trivia_game(text,text,integer,integer,text) TO service_role;
REVOKE ALL ON FUNCTION update_trivia_game_settings(uuid,text,text,integer,integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_trivia_game_settings(uuid,text,text,integer,integer) TO public;
GRANT EXECUTE ON FUNCTION update_trivia_game_settings(uuid,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION update_trivia_game_settings(uuid,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_trivia_game_settings(uuid,text,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION private.reveal_trivia_question(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.reveal_trivia_question(uuid) TO public;
REVOKE ALL ON FUNCTION submit_trivia_answer(uuid,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_trivia_answer(uuid,text) TO public;
GRANT EXECUTE ON FUNCTION submit_trivia_answer(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION submit_trivia_answer(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_trivia_answer(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION leave_trivia_game(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION leave_trivia_game(uuid) TO public;
GRANT EXECUTE ON FUNCTION leave_trivia_game(uuid) TO anon;
GRANT EXECUTE ON FUNCTION leave_trivia_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_trivia_game(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.maybe_transfer_trivia_host(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.maybe_transfer_trivia_host(uuid) TO public;
REVOKE ALL ON FUNCTION heartbeat_trivia_presence(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION heartbeat_trivia_presence(uuid) TO public;
GRANT EXECUTE ON FUNCTION heartbeat_trivia_presence(uuid) TO anon;
GRANT EXECUTE ON FUNCTION heartbeat_trivia_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION heartbeat_trivia_presence(uuid) TO service_role;
REVOKE ALL ON FUNCTION join_trivia_game(text,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION join_trivia_game(text,text) TO public;
GRANT EXECUTE ON FUNCTION join_trivia_game(text,text) TO anon;
GRANT EXECUTE ON FUNCTION join_trivia_game(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_trivia_game(text,text) TO service_role;
REVOKE ALL ON FUNCTION advance_trivia_question(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION advance_trivia_question(uuid) TO public;
GRANT EXECUTE ON FUNCTION advance_trivia_question(uuid) TO anon;
GRANT EXECUTE ON FUNCTION advance_trivia_question(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_trivia_question(uuid) TO service_role;
REVOKE ALL ON FUNCTION unblock_friend_connection(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION unblock_friend_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION unblock_friend_connection(uuid) TO service_role;
REVOKE ALL ON FUNCTION delete_throw(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_throw(uuid) TO public;
GRANT EXECUTE ON FUNCTION delete_throw(uuid) TO anon;
GRANT EXECUTE ON FUNCTION delete_throw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_throw(uuid) TO service_role;
REVOKE ALL ON FUNCTION mark_throw_read(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_throw_read(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mark_throw_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION block_friend_connection(uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION block_friend_connection(uuid) TO public;
GRANT EXECUTE ON FUNCTION block_friend_connection(uuid) TO anon;
GRANT EXECUTE ON FUNCTION block_friend_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION block_friend_connection(uuid) TO service_role;
REVOKE ALL ON FUNCTION confirm_throw_alert(uuid,timestamp with time zone) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_throw_alert(uuid,timestamp with time zone) TO public;
GRANT EXECUTE ON FUNCTION confirm_throw_alert(uuid,timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION confirm_throw_alert(uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_throw_alert(uuid,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION send_friend_request_by_user_id(uuid,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION send_friend_request_by_user_id(uuid,text) TO public;
GRANT EXECUTE ON FUNCTION send_friend_request_by_user_id(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION send_friend_request_by_user_id(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION send_friend_request_by_user_id(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION notify_status_posted() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION notify_status_posted() TO public;
GRANT EXECUTE ON FUNCTION notify_status_posted() TO anon;
GRANT EXECUTE ON FUNCTION notify_status_posted() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_status_posted() TO service_role;
REVOKE ALL ON FUNCTION respond_friend_request(uuid,boolean) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION respond_friend_request(uuid,boolean) TO public;
GRANT EXECUTE ON FUNCTION respond_friend_request(uuid,boolean) TO anon;
GRANT EXECUTE ON FUNCTION respond_friend_request(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION respond_friend_request(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION send_friend_request(text,text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION send_friend_request(text,text) TO public;
GRANT EXECUTE ON FUNCTION send_friend_request(text,text) TO anon;
GRANT EXECUTE ON FUNCTION send_friend_request(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION send_friend_request(text,text) TO service_role;
REVOKE ALL ON FUNCTION send_throw(uuid,text,jsonb,text,uuid,text[],integer[],integer[],text,integer[],integer,integer,integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION send_throw(uuid,text,jsonb,text,uuid,text[],integer[],integer[],text,integer[],integer,integer,integer) TO public;
GRANT EXECUTE ON FUNCTION send_throw(uuid,text,jsonb,text,uuid,text[],integer[],integer[],text,integer[],integer,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION send_throw(uuid,text,jsonb,text,uuid,text[],integer[],integer[],text,integer[],integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION send_throw(uuid,text,jsonb,text,uuid,text[],integer[],integer[],text,integer[],integer,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION notify_chat_message() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION notify_chat_message() TO public;
GRANT EXECUTE ON FUNCTION notify_chat_message() TO anon;
GRANT EXECUTE ON FUNCTION notify_chat_message() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_chat_message() TO service_role;
REVOKE ALL ON FUNCTION search_profiles(text) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_profiles(text) TO public;
GRANT EXECUTE ON FUNCTION search_profiles(text) TO anon;
GRANT EXECUTE ON FUNCTION search_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_profiles(text) TO service_role;
REVOKE ALL ON FUNCTION suggested_nearby_friends(integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION suggested_nearby_friends(integer) TO public;
GRANT EXECUTE ON FUNCTION suggested_nearby_friends(integer) TO anon;
GRANT EXECUTE ON FUNCTION suggested_nearby_friends(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION suggested_nearby_friends(integer) TO service_role;
REVOKE ALL ON FUNCTION get_map_locations() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_map_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_map_locations() TO service_role;
REVOKE ALL ON FUNCTION throw_profiles_default_visibility() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION throw_profiles_default_visibility() TO public;
GRANT EXECUTE ON FUNCTION throw_profiles_default_visibility() TO anon;
GRANT EXECUTE ON FUNCTION throw_profiles_default_visibility() TO authenticated;
GRANT EXECUTE ON FUNCTION throw_profiles_default_visibility() TO service_role;
REVOKE ALL ON FUNCTION direct_messages_link_throw() FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION direct_messages_link_throw() TO public;
GRANT EXECUTE ON FUNCTION direct_messages_link_throw() TO anon;
GRANT EXECUTE ON FUNCTION direct_messages_link_throw() TO authenticated;
GRANT EXECUTE ON FUNCTION direct_messages_link_throw() TO service_role;
REVOKE ALL ON FUNCTION hug_throw(uuid,integer) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hug_throw(uuid,integer) TO anon;
GRANT EXECUTE ON FUNCTION hug_throw(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION hug_throw(uuid,integer) TO service_role;
-- ---------- profiles: Sailo's table gains MySpace's fields ----------
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists profile_visibility text not null default 'space_members',
  add column if not exists friend_code text,
  add column if not exists avatar_color smallint;
alter table public.profiles add constraint profiles_profile_visibility_check check (profile_visibility = any (array['only_me'::text, 'space_members'::text]));
alter table public.profiles add constraint profiles_avatar_color_check check ((avatar_color is null) or ((avatar_color >= 0) and (avatar_color <= 7)));
update public.profiles set friend_code = private.generate_friend_code() where friend_code is null;
alter table public.profiles alter column friend_code set not null;
alter table public.profiles add constraint profiles_friend_code_key unique (friend_code);
create trigger profiles_set_friend_code before insert on public.profiles for each row execute function private.set_friend_code();

-- phone and date of birth: only ever read by their owner, so they live in their own owner-only table
create table public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  date_of_birth date,
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
create policy "profile private: own row" on public.profile_private for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profile_private from anon;

-- Sailo's 'everyone signed in can read profiles' now skips profiles marked only-me; MySpace's own rules come along
drop policy "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (profile_visibility <> 'only_me' or id = auth.uid());
create policy "Individuals insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "View co-member profiles on shared cards" on public.profiles for select using ((profile_visibility = 'space_members'::text) and private.shares_card_with(id, auth.uid()));
create policy "View co-member profiles on shared split groups" on public.profiles for select using ((profile_visibility = 'space_members'::text) and private.shares_split_with(id, auth.uid()));
create policy "View accepted friend profiles" on public.profiles for select using (private.is_accepted_friend(id, auth.uid()));
create policy "View co-member profiles on shared chat groups" on public.profiles for select using ((profile_visibility = 'space_members'::text) and private.shares_chat_group_with(id, auth.uid()));

-- ---------- one new-user trigger for both apps ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare want citext := nullif(new.raw_user_meta_data->>'username','');
begin
  if want is not null and (want !~ '^[A-Za-z0-9._]{3,20}$'
     or exists (select 1 from profiles where username = want)
     or exists (select 1 from reserved_usernames where name = want)) then
    want := null;  -- never block signup; onboarding asks again
  end if;
  insert into profiles(id, username, display_name, full_name, avatar_color)
    values (new.id, want, left(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 40),
      new.raw_user_meta_data->>'full_name',
      case when (new.raw_user_meta_data->>'avatar_color') ~ '^[0-7]$' then (new.raw_user_meta_data->>'avatar_color')::smallint end)
    on conflict (id) do nothing;
  insert into user_boats(user_id, boat_id, active) values (new.id, 'drifter', true) on conflict do nothing;
  insert into user_streaks(user_id) values (new.id) on conflict do nothing;
  insert into user_state(user_id) values (new.id) on conflict do nothing;
  return new;
end $function$;

-- ---------- storage: MySpace's buckets (avatars is shared: its limits widen to MySpace's photos) ----------
insert into storage.buckets (id, name, public) values ('item-photos','item-photos',true), ('chat-media','chat-media',true), ('throw-media','throw-media',true), ('throw-stories','throw-stories',true) on conflict (id) do nothing;
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/gif'] where id = 'avatars';

CREATE POLICY "Chat media is publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'chat-media'::text));
CREATE POLICY "Item photos are publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'item-photos'::text));
CREATE POLICY "Throw media is publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'throw-media'::text));
CREATE POLICY "Throw stories are publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'throw-stories'::text));
CREATE POLICY "Users delete own chat media" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'chat-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users delete own item photos" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'item-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users delete own throw media" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'throw-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users delete own throw stories" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'throw-stories'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users update own item photos" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'item-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users upload own chat media" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'chat-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users upload own item photos" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'item-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users upload own throw media" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'throw-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users upload own throw stories" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'throw-stories'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ---------- realtime and the scheduled sweep ----------
alter publication supabase_realtime add table public.split_settlements, public.split_chat_messages, public.notifications, public.friend_connections, public.direct_messages, public.payment_attempts, public.user_last_seen, public.location_shares, public.chat_groups, public.chat_group_members, public.group_polls, public.group_poll_votes, public.group_messages, public.game_rooms, public.game_players, public.game_rounds, public.game_answers, public.player_game_stats, public.game_point_transactions, public.throw_profiles, public.throws;
create extension if not exists pg_cron;
select cron.schedule('sweep-group-rename-polls', '* * * * *', 'select private.sweep_expired_rename_polls();');
