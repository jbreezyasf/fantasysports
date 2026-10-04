-- Notifications: preferences and consent, web push subscriptions, league announcements and
-- per-recipient delivery records.
--
-- NOT APPLIED to production as of 2026-10-04. The application treats every object here as
-- optional: while they are absent, the settings page says notifications are unavailable, the
-- push routes answer 503, and the operator page refuses to draft or send. See docs/NOTIFICATIONS.md.
--
-- Access model
--   * RLS is enabled on all four tables.
--   * A signed-in user can read their own preferences row and a safe column subset of their own
--     push subscriptions. Every write by a signed-in user goes through a SECURITY DEFINER
--     function that checks auth.uid().
--   * notifications and notification_deliveries have no policies: only the service role (the
--     server, after the ops permission check in apps/web/lib/ops/permissions.ts) touches them.
--   * Functions meant for the server refuse a signed-in caller and are granted to service_role only.

-- ---------------------------------------------------------------------------
-- 1. Preferences and consent
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- League-operations email. On by default: a member joined a league and gave an email address.
  email_enabled boolean not null default true,
  -- Push stays off until the user enables it from a browser, which also stores a subscription.
  push_enabled boolean not null default false,
  league_announcements boolean not null default true,
  lineup_lock_reminder boolean not null default true,
  score_final boolean not null default true,
  trade_offer boolean not null default true,
  waiver_result boolean not null default true,
  weekly_recap boolean not null default true,
  locale text not null default 'en',
  -- Set when email was switched off through the signed link in an email (no login).
  email_unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_locale_check check (locale in ('en', 'es-419'))
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));

-- A user's own preferences. A missing row means the column defaults above.
create function public.set_notification_preferences(
  p_email_enabled boolean,
  p_push_enabled boolean,
  p_categories jsonb,
  p_locale text
) returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_categories jsonb := coalesce(p_categories, '{}'::jsonb);
  v_key text;
  v_row public.notification_preferences;
begin
  if v_user is null then
    raise exception 'Sign in to change notification preferences' using errcode = '42501';
  end if;
  if jsonb_typeof(v_categories) <> 'object' then
    raise exception 'Categories must be an object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_categories) loop
    if v_key not in ('league_announcements', 'lineup_lock_reminder', 'score_final', 'trade_offer', 'waiver_result', 'weekly_recap') then
      raise exception 'Unknown notification category: %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(v_categories -> v_key) <> 'boolean' then
      raise exception 'Category % must be true or false', v_key using errcode = '22023';
    end if;
  end loop;
  if p_locale is not null and p_locale not in ('en', 'es-419') then
    raise exception 'Unsupported language' using errcode = '22023';
  end if;

  insert into public.notification_preferences as p (
    user_id, email_enabled, push_enabled,
    league_announcements, lineup_lock_reminder, score_final, trade_offer, waiver_result, weekly_recap,
    locale, email_unsubscribed_at
  ) values (
    v_user, coalesce(p_email_enabled, true), coalesce(p_push_enabled, false),
    coalesce((v_categories ->> 'league_announcements')::boolean, true),
    coalesce((v_categories ->> 'lineup_lock_reminder')::boolean, true),
    coalesce((v_categories ->> 'score_final')::boolean, true),
    coalesce((v_categories ->> 'trade_offer')::boolean, true),
    coalesce((v_categories ->> 'waiver_result')::boolean, true),
    coalesce((v_categories ->> 'weekly_recap')::boolean, true),
    coalesce(p_locale, 'en'), null
  )
  on conflict (user_id) do update set
    email_enabled = coalesce(p_email_enabled, p.email_enabled),
    push_enabled = coalesce(p_push_enabled, p.push_enabled),
    league_announcements = coalesce((v_categories ->> 'league_announcements')::boolean, p.league_announcements),
    lineup_lock_reminder = coalesce((v_categories ->> 'lineup_lock_reminder')::boolean, p.lineup_lock_reminder),
    score_final = coalesce((v_categories ->> 'score_final')::boolean, p.score_final),
    trade_offer = coalesce((v_categories ->> 'trade_offer')::boolean, p.trade_offer),
    waiver_result = coalesce((v_categories ->> 'waiver_result')::boolean, p.waiver_result),
    weekly_recap = coalesce((v_categories ->> 'weekly_recap')::boolean, p.weekly_recap),
    locale = coalesce(p_locale, p.locale),
    -- Turning email back on while signed in clears the unsubscribe marker.
    email_unsubscribed_at = case when coalesce(p_email_enabled, p.email_enabled) then null else p.email_unsubscribed_at end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.set_notification_preferences(boolean, boolean, jsonb, text) from public, anon;
grant execute on function public.set_notification_preferences(boolean, boolean, jsonb, text) to authenticated;

-- Called by the server after it has verified the signed unsubscribe token from an email.
-- Switches league-operations email off for that user. It never touches Supabase Auth, so
-- password-reset and other security email is unaffected.
create function public.notification_unsubscribe_email(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'notification_unsubscribe_email is a server function' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    return false;
  end if;
  insert into public.notification_preferences as p (user_id, email_enabled, email_unsubscribed_at)
  values (p_user_id, false, now())
  on conflict (user_id) do update set
    email_enabled = false,
    email_unsubscribed_at = coalesce(p.email_unsubscribed_at, now()),
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.notification_unsubscribe_email(uuid) from public, anon, authenticated;
grant execute on function public.notification_unsubscribe_email(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Web push subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  constraint push_subscriptions_keys_check check (char_length(p256dh) between 20 and 256 and char_length(auth) between 8 and 128)
);

create index push_subscriptions_active_user_idx on public.push_subscriptions (user_id) where revoked_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- The endpoint and keys are capabilities for sending to a device; the browser already holds
-- them, so the app never needs to read them back. Only descriptive columns are readable.
grant select (id, user_id, user_agent, created_at, last_success_at, revoked_at) on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- Stores the calling user's browser subscription and switches push on for them. An endpoint
-- belongs to one browser profile, so if another account subscribed from it earlier, it moves
-- to the caller.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to enable push notifications' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048
     or p_p256dh is null or char_length(p_p256dh) not between 20 and 256
     or p_auth is null or char_length(p_auth) not between 8 and 128 then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;
  if (select count(*) from public.push_subscriptions s
      where s.user_id = v_user and s.revoked_at is null and s.endpoint <> p_endpoint) >= 10 then
    raise exception 'Too many devices have push enabled. Turn one off first.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update set
    user_id = v_user,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    created_at = case when s.user_id = v_user and s.revoked_at is null then s.created_at else now() end,
    last_success_at = case when s.user_id = v_user then s.last_success_at else null end,
    revoked_at = null,
    revoked_reason = null
  returning s.id into v_id;

  insert into public.notification_preferences as p (user_id, push_enabled)
  values (v_user, true)
  on conflict (user_id) do update set push_enabled = true, updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Revokes one of the caller's subscriptions. Returns false when the endpoint is not theirs.
create function public.revoke_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'Sign in to change push notifications' using errcode = '42501';
  end if;
  update public.push_subscriptions s
    set revoked_at = now(), revoked_reason = 'user'
    where s.endpoint = p_endpoint and s.user_id = v_user and s.revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.revoke_push_subscription(text) from public, anon;
grant execute on function public.revoke_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notifications (first kind: league announcement)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'league_announcement',
  category text not null default 'league_announcements',
  -- Audience: the members of this league season's league.
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  -- English is the base language.
  title text not null,
  body text not null,
  link text,
  push_title text not null,
  push_body text not null,
  -- Other languages: {"es-419": {"title": "...", "body": "...", "push_title": "...", "push_body": "..."}}
  variants jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_for timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  result jsonb,
  constraint notifications_kind_check check (kind in ('league_announcement')),
  constraint notifications_category_check check (category in ('league_announcements', 'lineup_lock_reminder', 'score_final', 'trade_offer', 'waiver_result', 'weekly_recap')),
  constraint notifications_status_check check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  constraint notifications_title_check check (char_length(title) between 1 and 120),
  constraint notifications_body_check check (char_length(body) between 1 and 8000),
  constraint notifications_push_check check (char_length(push_title) between 1 and 39 and char_length(push_body) between 1 and 119),
  constraint notifications_link_check check (link is null or (link ~ '^/' and link !~ '^//' and char_length(link) <= 500)),
  constraint notifications_variants_check check (jsonb_typeof(variants) = 'object')
);

create index notifications_league_season_idx on public.notifications (league_season_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- Content is frozen once sending has begun, so what was previewed is what is delivered.
create function public.notifications_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('sending', 'sent', 'cancelled') and (
    new.title, new.body, new.link, new.push_title, new.push_body, new.variants, new.league_season_id, new.kind, new.category
  ) is distinct from (
    old.title, old.body, old.link, old.push_title, old.push_body, old.variants, old.league_season_id, old.kind, old.category
  ) then
    raise exception 'A notification cannot be edited once it is %', old.status;
  end if;
  if old.status in ('sent', 'cancelled') and new.status <> old.status then
    raise exception 'A notification that is % cannot change status', old.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger notifications_guard_update before update on public.notifications
  for each row execute function public.notifications_guard_update();

-- Moves a draft or scheduled notification to "sending". Returns 'started', 'resumed' (it was
-- already sending: a retried job continues it) or 'refused:<status>'.
create function public.notification_begin_send(p_notification_id uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is not null then
    raise exception 'notification_begin_send is a server function' using errcode = '42501';
  end if;
  select n.status into v_status from public.notifications n where n.id = p_notification_id for update;
  if v_status is null then return 'refused:missing'; end if;
  if v_status = 'sending' then return 'resumed'; end if;
  if v_status not in ('draft', 'scheduled') then return 'refused:' || v_status; end if;
  update public.notifications n
    set status = 'sending', sending_started_at = now(), sent_by = p_actor
    where n.id = p_notification_id;
  return 'started';
end;
$$;

revoke all on function public.notification_begin_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notification_begin_send(uuid, uuid) to service_role;

-- Records the fan-out report. The notification becomes "sent" only when p_complete is true
-- (no recipient is left in a retryable or unknown state); otherwise it stays "sending" so the
-- operator can run the send again.
create function public.notification_finish_send(p_notification_id uuid, p_result jsonb, p_complete boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is not null then
    raise exception 'notification_finish_send is a server function' using errcode = '42501';
  end if;
  update public.notifications n
    set result = p_result,
        status = case when p_complete then 'sent' else n.status end,
        sent_at = case when p_complete then now() else n.sent_at end
    where n.id = p_notification_id and n.status = 'sending'
    returning n.status into v_status;
  return coalesce(v_status, 'unchanged');
end;
$$;

revoke all on function public.notification_finish_send(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.notification_finish_send(uuid, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Deliveries: one row per notification + user + channel (+ purpose), the idempotency key
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  -- 'live' is the real send. 'test' is the operator's send-to-self and never blocks a live send.
  purpose text not null default 'live',
  status text not null,
  attempts integer not null default 1,
  provider_message_id text,
  error text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_key unique (notification_id, user_id, channel, purpose),
  constraint notification_deliveries_channel_check check (channel in ('email', 'push')),
  constraint notification_deliveries_purpose_check check (purpose in ('live', 'test')),
  constraint notification_deliveries_status_check check (status in ('sending', 'sent', 'failed', 'skipped', 'would_send'))
);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

-- Atomically claims the right to deliver. True means the caller must now deliver and record
-- the outcome. False means another run already delivered, is delivering, or gave up:
--   sent                -> never claimed again (no double send);
--   sending             -> not claimed (a live row left in this state after a crash needs an
--                          operator to look; it is never re-sent automatically);
--   failed              -> claimed again, up to 5 attempts;
--   skipped, would_send -> claimed again (preferences may have changed; a dry run sent nothing).
-- A 'test' row can always be claimed again unless a test is in flight (under 5 minutes old).
create function public.notification_claim_delivery(p_notification_id uuid, p_user_id uuid, p_channel text, p_purpose text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'notification_claim_delivery is a server function' using errcode = '42501';
  end if;
  insert into public.notification_deliveries as d (notification_id, user_id, channel, purpose, status, attempts)
  values (p_notification_id, p_user_id, p_channel, p_purpose, 'sending', 1)
  on conflict (notification_id, user_id, channel, purpose) do update
    set status = 'sending', attempts = d.attempts + 1, error = null, updated_at = now()
    where (d.purpose = 'live' and (d.status in ('skipped', 'would_send') or (d.status = 'failed' and d.attempts < 5)))
       or (d.purpose = 'test' and (d.status <> 'sending' or d.updated_at < now() - interval '5 minutes'))
  returning d.id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.notification_claim_delivery(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notification_claim_delivery(uuid, uuid, text, text) to service_role;

-- The members of a league season's league with their email address and effective preferences
-- (column defaults when a member has no preferences row).
create function public.notification_audience(p_league_season_id uuid)
returns table (
  user_id uuid,
  email text,
  email_enabled boolean,
  push_enabled boolean,
  league_announcements boolean,
  lineup_lock_reminder boolean,
  score_final boolean,
  trade_offer boolean,
  waiver_result boolean,
  weekly_recap boolean,
  locale text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'notification_audience is a server function' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text,
      coalesce(p.email_enabled, true), coalesce(p.push_enabled, false),
      coalesce(p.league_announcements, true), coalesce(p.lineup_lock_reminder, true),
      coalesce(p.score_final, true), coalesce(p.trade_offer, true),
      coalesce(p.waiver_result, true), coalesce(p.weekly_recap, true),
      coalesce(p.locale, 'en')
    from public.league_seasons ls
    join public.league_members m on m.league_id = ls.league_id
    join auth.users u on u.id = m.user_id
    left join public.notification_preferences p on p.user_id = m.user_id
    where ls.id = p_league_season_id
    order by m.joined_at, m.user_id;
end;
$$;

revoke all on function public.notification_audience(uuid) from public, anon, authenticated;
grant execute on function public.notification_audience(uuid) to service_role;

grant select, insert, update, delete on public.notification_preferences, public.push_subscriptions, public.notifications, public.notification_deliveries to service_role;
