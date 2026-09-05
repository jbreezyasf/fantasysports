create table if not exists public.league_season_entitlements (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  competition_season_id uuid not null references public.competition_seasons(id) on delete restrict,
  sport_code text not null,
  season_year integer not null,
  product_code text not null,
  status text not null check (status in ('pending_payment','active','expired','refunded','revoked','disputed')),
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_event_id text,
  activated_at timestamp with time zone,
  expires_at timestamp with time zone,
  refunded_at timestamp with time zone,
  revoked_at timestamp with time zone,
  disputed_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.league_season_entitlements is
  'League-season scoped Executive entitlement records. Stripe success redirects do not activate this table; verified server webhook/service-role code does.';

comment on column public.league_season_entitlements.product_code is
  'Launch value: big_exec_executive_league_season_pass.';

create unique index if not exists league_season_entitlements_active_product_idx
  on public.league_season_entitlements(league_season_id, product_code)
  where status in ('pending_payment','active');

create unique index if not exists league_season_entitlements_checkout_session_idx
  on public.league_season_entitlements(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists league_season_entitlements_payment_intent_idx
  on public.league_season_entitlements(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists league_season_entitlements_stripe_event_idx
  on public.league_season_entitlements(stripe_event_id)
  where stripe_event_id is not null;

create index if not exists league_season_entitlements_league_status_idx
  on public.league_season_entitlements(league_id, status, created_at desc);

create index if not exists league_season_entitlements_purchaser_idx
  on public.league_season_entitlements(purchaser_user_id, created_at desc);

create or replace function public.set_league_season_entitlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_league_season_entitlements_updated_at on public.league_season_entitlements;
create trigger set_league_season_entitlements_updated_at
before update on public.league_season_entitlements
for each row execute function public.set_league_season_entitlements_updated_at();

alter table public.league_season_entitlements enable row level security;

drop policy if exists league_season_entitlements_member_read on public.league_season_entitlements;
create policy league_season_entitlements_member_read
on public.league_season_entitlements
for select
to authenticated
using (
  exists (
    select 1
    from public.league_members lm
    where lm.league_id = league_season_entitlements.league_id
      and lm.user_id = (select auth.uid())
  )
);

revoke all on public.league_season_entitlements from anon;
revoke all on public.league_season_entitlements from authenticated;
grant select on public.league_season_entitlements to authenticated;
grant all on public.league_season_entitlements to service_role;

revoke all on function public.set_league_season_entitlements_updated_at() from anon;
revoke all on function public.set_league_season_entitlements_updated_at() from authenticated;
grant execute on function public.set_league_season_entitlements_updated_at() to service_role;
