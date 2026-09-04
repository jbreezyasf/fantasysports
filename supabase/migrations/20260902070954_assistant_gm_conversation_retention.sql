create table if not exists public.assistant_gm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  mode text not null check (mode in ('standard','pro_plus')),
  current_screen text,
  retained_summary text,
  user_preferences jsonb not null default '{}'::jsonb,
  retention_until timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.assistant_gm_conversations is
  'Bounded Assistant GM conversation context. Stores summaries/preferences only; raw voice audio is not stored here.';

create index if not exists assistant_gm_conversations_user_league_idx
  on public.assistant_gm_conversations(user_id, league_id, league_season_id, updated_at desc)
  where deleted_at is null;

create index if not exists assistant_gm_conversations_retention_idx
  on public.assistant_gm_conversations(retention_until)
  where deleted_at is null and retention_until is not null;

create or replace function public.set_assistant_gm_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_assistant_gm_conversations_updated_at on public.assistant_gm_conversations;
create trigger set_assistant_gm_conversations_updated_at
before update on public.assistant_gm_conversations
for each row execute function public.set_assistant_gm_conversations_updated_at();

alter table public.assistant_gm_conversations enable row level security;

drop policy if exists assistant_gm_conversations_owner_member_read on public.assistant_gm_conversations;
create policy assistant_gm_conversations_owner_member_read
on public.assistant_gm_conversations
for select
to authenticated
using (
  user_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1
    from public.league_members lm
    where lm.league_id = assistant_gm_conversations.league_id
      and lm.user_id = (select auth.uid())
  )
);

drop policy if exists assistant_gm_conversations_owner_member_insert on public.assistant_gm_conversations;
create policy assistant_gm_conversations_owner_member_insert
on public.assistant_gm_conversations
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.league_members lm
    where lm.league_id = assistant_gm_conversations.league_id
      and lm.user_id = (select auth.uid())
  )
);

drop policy if exists assistant_gm_conversations_owner_member_update on public.assistant_gm_conversations;
create policy assistant_gm_conversations_owner_member_update
on public.assistant_gm_conversations
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.league_members lm
    where lm.league_id = assistant_gm_conversations.league_id
      and lm.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.league_members lm
    where lm.league_id = assistant_gm_conversations.league_id
      and lm.user_id = (select auth.uid())
  )
);

revoke all on public.assistant_gm_conversations from anon;
grant select, insert, update on public.assistant_gm_conversations to authenticated;
grant all on public.assistant_gm_conversations to service_role;

revoke all on function public.set_assistant_gm_conversations_updated_at() from anon;
revoke all on function public.set_assistant_gm_conversations_updated_at() from authenticated;
grant execute on function public.set_assistant_gm_conversations_updated_at() to service_role;
