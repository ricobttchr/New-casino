-- NOVA Casino — online-mode schema (Phase 5 follow-up: "funktionierender Online-Modus
-- mit anmelden etc.").
--
-- This migration creates everything the client in nova-casino.html already expects to
-- exist (window.__backend / CasinoBackend, see js/backend.js inside nova-casino.html):
-- profiles+wallets+devices+game feature state, the spin/gamble ledger tables, friends,
-- activity feed, presence, and client error logging, plus every RPC the client calls
-- (client_sync_snapshot, find_profile_by_friend_code, accept_friendship,
-- release_player_device, log_client_error). It does not invent a new contract — every
-- table/column/RPC name and shape here was reverse-engineered directly from the
-- existing client code, not designed from scratch.
--
-- Pure simulation, no real money: balances are `_cents` integers with no payment
-- provider anywhere in this schema, matching the product's non-negotiable rule.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null default 'Spieler',
  friend_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 10000 check (balance_cents >= 0),
  spin_count bigint not null default 0,
  lifetime_wagered_cents bigint not null default 0,
  lifetime_won_cents bigint not null default 0,
  biggest_win_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- One active device per account at a time (client calls release_player_device on
-- logout; client_sync_snapshot claims the calling device and reports a conflict if a
-- different device already holds the claim -- see backend.deviceConflict).
create table public.devices (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  device_id text not null,
  claimed_at timestamptz not null default now()
);

-- Per-(user,game) feature state (free-spin counters, multipliers, the Tomb of Kings
-- expanding symbol). Server-authoritative: the client never sends its own feature
-- state to /functions/v1/spin, it only ever reads back what the server decides.
create table public.game_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null check (game_key in ('shark-abyss','fruit-reactor','fancy-harvest','tomb-of-kings')),
  feature_remaining int not null default 0,
  feature_multiplier numeric not null default 1,
  feature_stake_cents int not null default 20,
  expanding_symbol text,
  session_id uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_key)
);

-- One row per settled spin. idempotency_key + user_id is unique so a retried request
-- (client reload mid-flight, see AUDIT.md B2) replays the same stored result instead
-- of spinning/paying out twice.
create table public.spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  game_key text not null,
  stake_cents int not null,
  is_free_spin boolean not null default false,
  total_cents bigint not null,
  balance_after_cents bigint not null,
  presentation jsonb not null,
  feature_state jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- Card-risk / ladder-risk rounds (Fruit Reactor, Fancy Harvest). A win on those two
-- games does not credit the wallet immediately -- it opens a gamble round that the
-- player either collects or keeps risking, exactly mirroring resolveLocalGamble() in
-- nova-casino.html.
create table public.gamble_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  spin_id uuid not null references public.spins(id) on delete cascade,
  game_key text not null,
  initial_cents bigint not null,
  current_cents bigint not null,
  level int not null default 0,
  max_level int not null default 5,
  status text not null default 'active' check (status in ('active','collected','busted','capped')),
  last_card jsonb,
  last_won boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency ledger for gamble actions, same purpose as `spins.idempotency_key`.
create table public.gamble_actions (
  round_id uuid not null references public.gamble_rounds(id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (round_id, idempotency_key)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

-- Friend activity feed. amount_cents is a simulation value with no monetary meaning
-- (see AUDIT.md M2, an intentional, documented product decision -- not changed here).
create table public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null,
  kind text not null default 'win' check (kind in ('win','feature')),
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_game text,
  last_seen_at timestamptz not null default now()
);

create table public.client_errors (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  build_version text,
  error_code text,
  game_key text,
  network_state text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index spins_user_created_idx on public.spins (user_id, created_at desc);
create index activity_feed_created_idx on public.activity_feed (created_at desc);
create index friendships_addressee_idx on public.friendships (addressee_id, status);
create index friendships_requester_idx on public.friendships (requester_id, status);

-- ---------------------------------------------------------------------------
-- New-account bootstrap: profile + wallet + one game_states row per game, created
-- the moment Supabase Auth creates the user (i.e. right after signUp()).
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
  v_code text;
begin
  v_username := 'player_' || substr(new.id::text, 1, 8);
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.profiles (id, username, display_name, friend_code)
    values (new.id, v_username, coalesce(new.raw_user_meta_data->>'display_name', 'Spieler'), v_code);
  insert into public.wallets (user_id) values (new.id);
  insert into public.game_states (user_id, game_key, feature_multiplier, feature_stake_cents, expanding_symbol) values
    (new.id, 'shark-abyss', 2, 20, null),
    (new.id, 'fruit-reactor', 1, 20, null),
    (new.id, 'fancy-harvest', 1, 20, null),
    (new.id, 'tomb-of-kings', 1, 20, null);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is "your own rows only" for direct REST access.
-- Cross-user reads (friends' presence/activity, looking someone up by friend code)
-- go through the SECURITY DEFINER RPCs below instead of relaxing RLS, so a client
-- can never query another user's private data directly.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.devices enable row level security;
alter table public.game_states enable row level security;
alter table public.spins enable row level security;
alter table public.gamble_rounds enable row level security;
alter table public.gamble_actions enable row level security;
alter table public.friendships enable row level security;
alter table public.activity_feed enable row level security;
alter table public.presence enable row level security;
alter table public.client_errors enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

create policy "own wallet" on public.wallets for select using (auth.uid() = user_id);
create policy "own device" on public.devices for select using (auth.uid() = user_id);
create policy "own game state" on public.game_states for select using (auth.uid() = user_id);
create policy "own spins" on public.spins for select using (auth.uid() = user_id);
create policy "own gamble rounds" on public.gamble_rounds for select using (auth.uid() = user_id);
create policy "own presence" on public.presence for select using (auth.uid() = user_id);
create policy "own client errors" on public.client_errors for select using (auth.uid() = user_id);

-- Friendships: a user may see and create rows where they are either side, matching
-- backend.sendFriendRequest() which inserts directly via PostgREST (not an RPC).
create policy "friendships visible to participants" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships insertable by requester" on public.friendships
  for insert with check (auth.uid() = requester_id);

comment on table public.gamble_actions is 'Written only by the gamble Edge Function via the service role key; no direct client access needed or granted.';

-- ---------------------------------------------------------------------------
-- RPCs the client calls directly (backend.rpc(name, body) -> POST /rest/v1/rpc/name)
-- ---------------------------------------------------------------------------

-- client_sync_snapshot(): claims the calling device, returns everything openProfile/
-- renderFriendStrip/renderLiveFeed/syncRemoteAccount need in one round trip. Mirrors
-- syncRemoteAccount()'s expected snapshot shape exactly (profile, wallet, friends,
-- activity, presence, activeGamble, deviceClaimed, serverTime).
create function public.client_sync_snapshot(
  p_device_id text,
  p_build_version text,
  p_game_key text default null,
  p_activity_limit int default 30
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_claimed boolean;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  insert into public.devices (user_id, device_id) values (v_user, p_device_id)
    on conflict (user_id) do update
      set device_id = excluded.device_id, claimed_at = now()
      where public.devices.device_id = excluded.device_id or public.devices.claimed_at < now() - interval '12 hours';
  select (device_id = p_device_id) into v_claimed from public.devices where user_id = v_user;

  if p_game_key is not null then
    insert into public.presence (user_id, current_game) values (v_user, p_game_key)
      on conflict (user_id) do update set current_game = excluded.current_game, last_seen_at = now();
  end if;

  select jsonb_build_object(
    'deviceClaimed', coalesce(v_claimed, false),
    'serverTime', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'profile', (select jsonb_build_object('display_name', display_name, 'username', username, 'friend_code', friend_code) from public.profiles where id = v_user),
    'wallet', (select jsonb_build_object('balance_cents', balance_cents, 'spin_count', spin_count, 'lifetime_wagered_cents', lifetime_wagered_cents, 'lifetime_won_cents', lifetime_won_cents, 'biggest_win_cents', biggest_win_cents) from public.wallets where user_id = v_user),
    'activeGamble', (select jsonb_build_object('roundId', gr.id, 'spinId', gr.spin_id, 'gameKey', gr.game_key, 'initialCents', gr.initial_cents, 'currentCents', gr.current_cents, 'level', gr.level, 'maxLevel', gr.max_level, 'status', gr.status, 'card', gr.last_card, 'won', gr.last_won) from public.gamble_rounds gr where gr.user_id = v_user and gr.status = 'active' order by gr.created_at desc limit 1),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendship_id', f.id,
        'friend_id', case when f.requester_id = v_user then f.addressee_id else f.requester_id end,
        'display_name', p2.display_name, 'username', p2.username,
        'status', f.status,
        'direction', case when f.addressee_id = v_user then 'incoming' else 'outgoing' end
      ))
      from public.friendships f
      join public.profiles p2 on p2.id = (case when f.requester_id = v_user then f.addressee_id else f.requester_id end)
      where f.requester_id = v_user or f.addressee_id = v_user
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', display_name, 'username', username, 'game_key', game_key, 'kind', kind, 'amount_cents', amount_cents, 'created_at', created_at) order by created_at desc)
      from (
        select a.game_key, a.kind, a.amount_cents, a.created_at, p2.display_name, p2.username
        from public.activity_feed a
        join public.profiles p2 on p2.id = a.user_id
        where a.user_id in (
          select case when f.requester_id = v_user then f.addressee_id else f.requester_id end
          from public.friendships f where (f.requester_id = v_user or f.addressee_id = v_user) and f.status = 'accepted'
        )
        order by a.created_at desc limit p_activity_limit
      ) recent_activity
    ), '[]'::jsonb),
    'presence', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', pr.user_id, 'current_game', pr.current_game, 'last_seen_at', pr.last_seen_at))
      from public.presence pr
      where pr.user_id in (
        select case when f.requester_id = v_user then f.addressee_id else f.requester_id end
        from public.friendships f where (f.requester_id = v_user or f.addressee_id = v_user) and f.status = 'accepted'
      )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create function public.find_profile_by_friend_code(p_code text)
returns table (id uuid, display_name text, username text)
language sql
security definer set search_path = public
as $$
  select id, display_name, username from public.profiles where friend_code = upper(trim(p_code));
$$;

create function public.accept_friendship(p_friendship_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_updated int;
begin
  update public.friendships set status = 'accepted'
    where id = p_friendship_id and addressee_id = v_user and status = 'pending';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create function public.release_player_device(p_device_id text)
returns void
language sql
security definer set search_path = public
as $$
  delete from public.devices where user_id = auth.uid() and device_id = p_device_id;
$$;

create function public.log_client_error(
  p_build_version text, p_error_code text, p_game_key text default null,
  p_network_state text default null, p_context jsonb default '{}'::jsonb
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.client_errors (user_id, build_version, error_code, game_key, network_state, context)
    values (auth.uid(), p_build_version, p_error_code, p_game_key, p_network_state, p_context);
$$;

-- ---------------------------------------------------------------------------
-- Ledger functions called ONLY from the spin/gamble Edge Functions (via the service
-- role key, never directly by the client). Both run the balance mutation and the
-- idempotency check inside one transaction with a row lock on the wallet, so two
-- concurrent requests (a retry racing the original) cannot double-pay.
-- ---------------------------------------------------------------------------
create function public.apply_spin_result(
  p_user_id uuid,
  p_idempotency_key text,
  p_game_key text,
  p_stake_cents int,
  p_is_free_spin boolean,
  p_total_cents bigint,
  p_presentation jsonb,
  p_feature_state jsonb,
  p_holds_in_gamble boolean
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing record;
  v_balance bigint;
  v_spin_id uuid;
  v_round_id uuid;
begin
  select * into v_existing from public.spins where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select id into v_round_id from public.gamble_rounds where spin_id = v_existing.id;
    return jsonb_build_object('spinId', v_existing.id, 'balanceCents', v_existing.balance_after_cents, 'presentation', v_existing.presentation, 'featureState', v_existing.feature_state, 'roundId', v_round_id, 'replayed', true);
  end if;

  select balance_cents into v_balance from public.wallets where user_id = p_user_id for update;
  if not p_is_free_spin then
    if v_balance < p_stake_cents then raise exception 'insufficient_balance'; end if;
    v_balance := v_balance - p_stake_cents;
  end if;
  if not p_holds_in_gamble then
    v_balance := v_balance + p_total_cents;
  end if;

  update public.wallets set
    balance_cents = v_balance,
    spin_count = spin_count + 1,
    lifetime_wagered_cents = lifetime_wagered_cents + (case when p_is_free_spin then 0 else p_stake_cents end),
    lifetime_won_cents = lifetime_won_cents + p_total_cents,
    biggest_win_cents = greatest(biggest_win_cents, p_total_cents),
    updated_at = now()
  where user_id = p_user_id;

  update public.game_states set
    feature_remaining = (p_feature_state->>'remaining')::int,
    feature_multiplier = coalesce((p_feature_state->>'multiplier')::numeric, feature_multiplier),
    feature_stake_cents = coalesce((p_feature_state->>'stakeCents')::int, feature_stake_cents),
    expanding_symbol = p_feature_state->>'expandingSymbol',
    updated_at = now()
  where user_id = p_user_id and game_key = p_game_key;

  insert into public.spins (user_id, idempotency_key, game_key, stake_cents, is_free_spin, total_cents, balance_after_cents, presentation, feature_state)
    values (p_user_id, p_idempotency_key, p_game_key, p_stake_cents, p_is_free_spin, p_total_cents, v_balance, p_presentation, p_feature_state)
    returning id into v_spin_id;

  if p_holds_in_gamble then
    insert into public.gamble_rounds (user_id, spin_id, game_key, initial_cents, current_cents)
      values (p_user_id, v_spin_id, p_game_key, p_total_cents, p_total_cents)
      returning id into v_round_id;
  end if;

  if p_total_cents >= p_stake_cents * 20 then
    insert into public.activity_feed (user_id, game_key, kind, amount_cents)
      values (p_user_id, p_game_key, case when (p_feature_state->>'remaining')::int > 0 then 'feature' else 'win' end, p_total_cents);
  end if;

  return jsonb_build_object('spinId', v_spin_id, 'balanceCents', v_balance, 'presentation', p_presentation, 'featureState', p_feature_state, 'roundId', v_round_id, 'replayed', false);
end;
$$;

create function public.apply_gamble_action(
  p_user_id uuid,
  p_round_id uuid,
  p_idempotency_key text,
  p_action text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing record;
  v_round record;
  v_balance bigint;
begin
  select * into v_existing from public.gamble_actions where round_id = p_round_id and idempotency_key = p_idempotency_key;
  if found then return v_existing.result; end if;

  select * into v_round from public.gamble_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'gamble round not found'; end if;
  if v_round.status <> 'active' then raise exception 'gamble_pending'; end if;

  select balance_cents into v_balance from public.wallets where user_id = p_user_id for update;
  if (p_result->>'status') in ('collected', 'capped') then
    v_balance := v_balance + (p_result->>'currentCents')::bigint;
    update public.wallets set balance_cents = v_balance, updated_at = now() where user_id = p_user_id;
  end if;

  update public.gamble_rounds set
    current_cents = (p_result->>'currentCents')::bigint,
    level = (p_result->>'level')::int,
    status = p_result->>'status',
    last_card = p_result->'card',
    last_won = (p_result->>'won')::boolean,
    updated_at = now()
  where id = p_round_id;

  perform 1;
  insert into public.gamble_actions (round_id, idempotency_key, result)
    values (p_round_id, p_idempotency_key, p_result || jsonb_build_object('balanceCents', v_balance));

  return p_result || jsonb_build_object('balanceCents', v_balance);
end;
$$;

-- Edge Functions call these with the service role key, which bypasses RLS entirely
-- (by design -- that's what "service role" means in Supabase), so no extra grants
-- are required here for them specifically. The RPCs above (client_sync_snapshot etc.)
-- run as the authenticated user via PostgREST and rely on `security definer` only to
-- reach across tables the caller cannot directly select (other users' profiles for
-- the friend feed) -- they still start from `auth.uid()`, never a client-supplied id.
