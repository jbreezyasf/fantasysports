-- Executable test for 20261004030000_notifications.sql: the RPCs and RLS, as different users.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_notifications_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_notifications_test -f supabase/tests/notifications.sql
--
-- It prints "notifications.sql: all checks passed" at the end. Any failed check raises and
-- stops the run. Only the columns the migration touches are created for the existing tables.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.fantasy_leagues (id uuid primary key default gen_random_uuid(), name text not null);
create table public.league_members (id uuid primary key default gen_random_uuid(), league_id uuid not null references public.fantasy_leagues(id), user_id uuid not null references auth.users(id), role text not null default 'manager', joined_at timestamptz not null default now(), unique (league_id, user_id));
create table public.league_seasons (id uuid primary key default gen_random_uuid(), league_id uuid not null references public.fantasy_leagues(id), is_current boolean not null default true);

\ir ../migrations/20261004030000_notifications.sql

-- Test helpers, usable by every role.
create schema t;
grant usage on schema t to anon, authenticated, service_role;
create function t.fails(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_like then return; end if;
    raise exception 'Expected an error like "%" but got "%" for: %', p_like, sqlerrm, p_sql;
  end;
  raise exception 'Expected an error like "%" but the statement succeeded: %', p_like, p_sql;
end $$;
create function t.is(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FAILED %: expected %, got %', p_label, p_expected, p_actual; end if;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Fixture: A and B are members of the league; C is a user outside it.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@example.test');
insert into public.fantasy_leagues (id, name) values ('11111111-1111-4111-8111-111111111111', 'Fixture League');
insert into public.league_seasons (id, league_id) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
insert into public.league_members (league_id, user_id, role, joined_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'commissioner', now() - interval '2 days'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'manager', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 0. Structure: RLS on every table, fixed search_path on every function
-- ---------------------------------------------------------------------------
select t.is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname in ('notification_preferences', 'push_subscriptions', 'notifications', 'notification_deliveries') and c.relrowsecurity), 4::bigint, 'RLS enabled on all four tables');
select t.is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('set_notification_preferences', 'notification_unsubscribe_email', 'save_push_subscription', 'revoke_push_subscription', 'notifications_guard_update', 'notification_begin_send', 'notification_finish_send', 'notification_claim_delivery', 'notification_audience')
               and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')), 9::bigint, 'all nine functions pin search_path');
select t.is((select count(*) from pg_policies where schemaname = 'public' and tablename in ('notifications', 'notification_deliveries')), 0::bigint, 'no policies on notifications or deliveries');
select t.is((select count(*) from pg_policies where schemaname = 'public' and tablename in ('notification_preferences', 'push_subscriptions') and cmd <> 'SELECT'), 0::bigint, 'no write policies for signed-in users');

-- ---------------------------------------------------------------------------
-- 1. anon: nothing
-- ---------------------------------------------------------------------------
set role anon;
select set_config('test.uid', '', false);
select t.fails($$select * from public.notification_preferences$$, '%permission denied%');
select t.fails($$select id from public.push_subscriptions$$, '%permission denied%');
select t.fails($$select * from public.notifications$$, '%permission denied%');
select t.fails($$select * from public.notification_deliveries$$, '%permission denied%');
select t.fails($$select public.set_notification_preferences(true, true, '{}'::jsonb, 'en')$$, '%permission denied%');
select t.fails($$select public.save_push_subscription('https://push.example/x', repeat('p', 40), repeat('a', 16), 'ua')$$, '%permission denied%');
select t.fails($$select * from public.notification_audience('22222222-2222-4222-8222-222222222222')$$, '%permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Preferences as user A
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

select t.is((select count(*) from public.notification_preferences), 0::bigint, 'A starts with no row');
select t.fails($$insert into public.notification_preferences (user_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '%permission denied%');

select t.is((public.set_notification_preferences(true, false, '{"weekly_recap": false}'::jsonb, 'es-419')).locale, 'es-419'::text, 'A saves preferences');
select t.is((select count(*) from public.notification_preferences), 1::bigint, 'A sees their own row');
select t.is((select weekly_recap from public.notification_preferences), false, 'category switch stored');
select t.is((select league_announcements from public.notification_preferences), true, 'unspecified category keeps its default');
select t.is((select push_enabled from public.notification_preferences), false, 'push stays off by default');

-- A partial update keeps what was not mentioned.
select t.is((public.set_notification_preferences(null, null, '{"trade_offer": false}'::jsonb, null)).weekly_recap, false, 'partial update keeps earlier choices');
select t.is((select locale from public.notification_preferences), 'es-419'::text, 'partial update keeps the language');

select t.fails($$select public.set_notification_preferences(true, false, '{"marketing": true}'::jsonb, 'en')$$, '%Unknown notification category%');
select t.fails($$select public.set_notification_preferences(true, false, '{"weekly_recap": "yes"}'::jsonb, 'en')$$, '%must be true or false%');
select t.fails($$select public.set_notification_preferences(true, false, '[]'::jsonb, 'en')$$, '%must be an object%');
select t.fails($$select public.set_notification_preferences(true, false, '{}'::jsonb, 'fr')$$, '%Unsupported language%');
select t.fails($$update public.notification_preferences set push_enabled = true$$, '%permission denied%');
select t.fails($$delete from public.notification_preferences$$, '%permission denied%');

-- Server-only functions refuse a signed-in user outright.
select t.fails($$select public.notification_unsubscribe_email('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '%permission denied%');
select t.fails($$select * from public.notification_audience('22222222-2222-4222-8222-222222222222')$$, '%permission denied%');
select t.fails($$select public.notification_claim_delivery(gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live')$$, '%permission denied%');
select t.fails($$select public.notification_begin_send(gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '%permission denied%');
select t.fails($$select public.notification_finish_send(gen_random_uuid(), '{}'::jsonb, true)$$, '%permission denied%');
select t.fails($$select * from public.notifications$$, '%permission denied%');
select t.fails($$insert into public.notifications (league_season_id, title, body, push_title, push_body) values ('22222222-2222-4222-8222-222222222222', 't', 'b', 'p', 'p')$$, '%permission denied%');
select t.fails($$select * from public.notification_deliveries$$, '%permission denied%');

-- ---------------------------------------------------------------------------
-- 3. Push subscriptions as A, then B
-- ---------------------------------------------------------------------------
select t.is((select public.save_push_subscription('https://push.example/device-a', repeat('p', 40), repeat('a', 16), 'Agent A') is not null), true, 'A stores a subscription');
select t.is((select push_enabled from public.notification_preferences), true, 'subscribing switches push on for A');
select t.is((select count(*) from public.push_subscriptions), 1::bigint, 'A sees their own subscription');
select t.is((select user_agent from public.push_subscriptions), 'Agent A'::text, 'descriptive columns are readable');
select t.fails($$select endpoint from public.push_subscriptions$$, '%permission denied%');
select t.fails($$select p256dh, auth from public.push_subscriptions$$, '%permission denied%');
select t.fails($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://push.example/direct', repeat('p', 40), repeat('a', 16))$$, '%permission denied%');
select t.fails($$update public.push_subscriptions set revoked_at = now()$$, '%permission denied%');
select t.fails($$select public.save_push_subscription('http://push.example/insecure', repeat('p', 40), repeat('a', 16), 'ua')$$, '%Invalid push subscription%');
select t.fails($$select public.save_push_subscription('https://push.example/short-key', 'short', repeat('a', 16), 'ua')$$, '%Invalid push subscription%');

-- Saving the same endpoint again is an update, not a second row.
select public.save_push_subscription('https://push.example/device-a', repeat('q', 40), repeat('b', 16), 'Agent A2');
select t.is((select count(*) from public.push_subscriptions), 1::bigint, 're-subscribing the same endpoint keeps one row');

-- At most 10 active devices.
select public.save_push_subscription('https://push.example/extra-' || n, repeat('p', 40), repeat('a', 16), 'ua') from generate_series(1, 9) n;
select t.fails($$select public.save_push_subscription('https://push.example/extra-10', repeat('p', 40), repeat('a', 16), 'ua')$$, '%Too many devices%');
select t.is((select public.revoke_push_subscription('https://push.example/extra-1')), true, 'A revokes one of their own');
select t.is((select count(*) from public.push_subscriptions where revoked_at is null), 9::bigint, 'revoked subscription is no longer active');

select set_config('test.uid', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select t.is((select count(*) from public.notification_preferences), 0::bigint, 'B cannot see A''s preferences');
select t.is((select count(*) from public.push_subscriptions), 0::bigint, 'B cannot see A''s subscriptions');
select t.is((select public.revoke_push_subscription('https://push.example/device-a')), false, 'B cannot revoke A''s subscription');
-- The same browser signs in as B and subscribes: the endpoint moves to B.
select public.save_push_subscription('https://push.example/device-a', repeat('r', 40), repeat('c', 16), 'Agent B');
select t.is((select count(*) from public.push_subscriptions), 1::bigint, 'the endpoint now belongs to B');

select set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select t.is((select count(*) from public.push_subscriptions where user_agent = 'Agent B'), 0::bigint, 'A no longer sees the endpoint B took over');

-- Signed out but with the authenticated role: every user RPC refuses.
select set_config('test.uid', '', false);
select t.fails($$select public.set_notification_preferences(true, true, '{}'::jsonb, 'en')$$, '%Sign in%');
select t.fails($$select public.save_push_subscription('https://push.example/anon', repeat('p', 40), repeat('a', 16), 'ua')$$, '%Sign in%');
select t.fails($$select public.revoke_push_subscription('https://push.example/device-a')$$, '%Sign in%');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Service role: audience, unsubscribe, announcements, deliveries
-- ---------------------------------------------------------------------------
set role service_role;
select set_config('test.uid', '', false);

select t.is((select count(*) from public.notification_audience('22222222-2222-4222-8222-222222222222')), 2::bigint, 'audience is the two league members');
select t.is((select count(*) from public.notification_audience('22222222-2222-4222-8222-222222222222') where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0::bigint, 'a user outside the league is not in the audience');
select t.is((select email from public.notification_audience('22222222-2222-4222-8222-222222222222') where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'a@example.test'::text, 'audience carries the account email');
select t.is((select locale from public.notification_audience('22222222-2222-4222-8222-222222222222') where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'es-419'::text, 'audience carries the chosen language');
-- B never opened the settings page but subscribed a device: email default on, push on.
select t.is((select email_enabled from public.notification_audience('22222222-2222-4222-8222-222222222222') where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), true, 'a member with no email choice defaults to league email on');

-- A member with no row at all gets the defaults.
delete from public.push_subscriptions where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.notification_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select t.is((select (email_enabled, push_enabled, league_announcements, locale)::text from public.notification_audience('22222222-2222-4222-8222-222222222222') where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), '(t,f,t,en)'::text, 'no row: email on, push off, announcements on, English');

-- Unsubscribe through the signed link.
select t.is((select public.notification_unsubscribe_email('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), true, 'unsubscribe a member with no row');
select t.is((select public.notification_unsubscribe_email('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), true, 'unsubscribe a member with a row');
select t.is((select public.notification_unsubscribe_email('dddddddd-dddd-4ddd-8ddd-dddddddddddd')), false, 'unknown user: nothing happens');
select t.is((select count(*) from public.notification_audience('22222222-2222-4222-8222-222222222222') where email_enabled), 0::bigint, 'both members now have league email off');
select t.is((select (push_enabled, weekly_recap, locale)::text from public.notification_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), '(t,f,es-419)'::text, 'unsubscribe touches only the email switch');
select t.is((select email_unsubscribed_at is not null from public.notification_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true, 'unsubscribe time recorded');
select t.is((select count(*) from auth.users), 3::bigint, 'unsubscribe does not touch auth.users (security email is separate)');

-- A server function called with a signed-in identity refuses, even as the service role.
select set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select t.fails($$select public.notification_unsubscribe_email('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '%server function%');
select t.fails($$select * from public.notification_audience('22222222-2222-4222-8222-222222222222')$$, '%server function%');
select t.fails($$select public.notification_claim_delivery(gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live')$$, '%server function%');
select set_config('test.uid', '', false);

-- Announcement constraints.
select t.fails($$insert into public.notifications (league_season_id, title, body, push_title, push_body) values ('22222222-2222-4222-8222-222222222222', 't', 'b', repeat('x', 40), 'p')$$, '%notifications_push_check%');
select t.fails($$insert into public.notifications (league_season_id, title, body, push_title, push_body) values ('22222222-2222-4222-8222-222222222222', 't', 'b', 'p', repeat('x', 120))$$, '%notifications_push_check%');
select t.fails($$insert into public.notifications (league_season_id, title, body, push_title, push_body, link) values ('22222222-2222-4222-8222-222222222222', 't', 'b', 'p', 'p', 'https://evil.example')$$, '%notifications_link_check%');
select t.fails($$insert into public.notifications (league_season_id, title, body, push_title, push_body, status) values ('22222222-2222-4222-8222-222222222222', 't', 'b', 'p', 'p', 'queued')$$, '%notifications_status_check%');

insert into public.notifications (id, league_season_id, title, body, push_title, push_body, link, created_by)
values ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222', 'Title', 'Body', 'Push title', 'Push body', '/dashboard', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select t.is((select status from public.notifications), 'draft'::text, 'a new announcement is a draft');
update public.notifications set title = 'Edited title' where id = '99999999-9999-4999-8999-999999999999';

-- Delivery claims: the idempotency key is notification + user + channel + purpose.
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live'), true, 'first claim wins');
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live'), false, 'a second job cannot claim a delivery in flight');
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), true, 'the other channel is a separate key');
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'test'), true, 'a test is a separate key');
update public.notification_deliveries set status = 'sent' where channel = 'email' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live'), false, 'sent is never claimed again');

update public.notification_deliveries set status = 'would_send' where channel = 'push' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), true, 'a dry-run row does not block the real send');
update public.notification_deliveries set status = 'skipped' where channel = 'push' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), true, 'a skipped row can be claimed again');
update public.notification_deliveries set status = 'failed' where channel = 'push' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), true, 'a failed row is retried');
update public.notification_deliveries set status = 'failed' where channel = 'push' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), true, 'fifth attempt');
select t.is((select attempts from public.notification_deliveries where channel = 'push' and purpose = 'live'), 5, 'attempts are counted');
update public.notification_deliveries set status = 'failed' where channel = 'push' and purpose = 'live';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'push', 'live'), false, 'after five attempts a failed delivery is given up');

select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'test'), false, 'a test in flight is not claimed twice');
update public.notification_deliveries set status = 'sent' where purpose = 'test';
select t.is(public.notification_claim_delivery('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'test'), true, 'a finished test can be repeated');
select t.is((select count(*) from public.notification_deliveries), 3::bigint, 'one row per notification + user + channel + purpose');
select t.fails($$insert into public.notification_deliveries (notification_id, user_id, channel, purpose, status) values ('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'live', 'sent')$$, '%notification_deliveries_key%');
select t.fails($$insert into public.notification_deliveries (notification_id, user_id, channel, purpose, status) values ('99999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sms', 'live', 'sent')$$, '%notification_deliveries_channel_check%');

-- Status flow.
select t.is(public.notification_begin_send('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'started'::text, 'draft -> sending');
select t.is(public.notification_begin_send('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'resumed'::text, 'a retried job resumes');
select t.fails($$update public.notifications set body = 'changed after sending began' where id = '99999999-9999-4999-8999-999999999999'$$, '%cannot be edited once it is sending%');
select t.is(public.notification_finish_send('99999999-9999-4999-8999-999999999999', '{"failures": 1}'::jsonb, false), 'sending'::text, 'an incomplete run stays in sending');
select t.is(public.notification_finish_send('99999999-9999-4999-8999-999999999999', '{"failures": 0}'::jsonb, true), 'sent'::text, 'a complete run becomes sent');
select t.is((select sent_at is not null and result = '{"failures": 0}'::jsonb from public.notifications), true, 'sent time and report stored');
select t.is(public.notification_begin_send('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'refused:sent'::text, 'a sent announcement cannot be sent again');
select t.is(public.notification_finish_send('99999999-9999-4999-8999-999999999999', '{}'::jsonb, true), 'unchanged'::text, 'finish is a no-op once sent');
select t.fails($$update public.notifications set status = 'draft' where id = '99999999-9999-4999-8999-999999999999'$$, '%cannot change status%');
select t.is(public.notification_begin_send('88888888-8888-4888-8888-888888888888', null), 'refused:missing'::text, 'unknown announcement');

insert into public.notifications (id, league_season_id, title, body, push_title, push_body, status)
values ('77777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', 'Cancelled', 'Body', 'p', 'p', 'cancelled');
select t.is(public.notification_begin_send('77777777-7777-4777-8777-777777777777', null), 'refused:cancelled'::text, 'a cancelled announcement cannot be sent');
reset role;

-- ---------------------------------------------------------------------------
-- 5. A re-enables league email while signed in; deleting the account removes their data
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('test.uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select t.is((select email_enabled from public.notification_preferences), false, 'A sees that league email is off');
select t.is((public.set_notification_preferences(true, null, null, null)).email_unsubscribed_at is null, true, 'turning email back on clears the unsubscribe marker');
reset role;
select set_config('test.uid', '', false);

delete from public.league_members where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select t.is((select count(*) from public.notification_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'preferences are deleted with the account');
select t.is((select count(*) from public.push_subscriptions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'subscriptions are deleted with the account');
select t.is((select count(*) from public.notification_deliveries where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'delivery rows are deleted with the account');
select t.is((select created_by is null from public.notifications where id = '99999999-9999-4999-8999-999999999999'), true, 'the announcement survives its author');

\echo notifications.sql: all checks passed
