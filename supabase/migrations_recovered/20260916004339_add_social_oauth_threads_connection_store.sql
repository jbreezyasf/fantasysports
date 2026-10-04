-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260916004339, name add_social_oauth_threads_connection_store. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.social_oauth_states (
  state_hash text primary key,
  provider text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.social_oauth_states enable row level security;

revoke all on public.social_oauth_states from anon;
revoke all on public.social_oauth_states from authenticated;

create table if not exists public.social_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  platform text not null,
  platform_account_id text not null,
  username text,
  display_name text,
  connection_status text not null default 'CONNECTED',
  granted_scopes text[] not null default '{}'::text[],
  token_type text,
  token_ciphertext text not null,
  token_iv text not null,
  token_auth_tag text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  last_refresh_at timestamptz,
  safe_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, platform, platform_account_id)
);

alter table public.social_oauth_connections enable row level security;

revoke all on public.social_oauth_connections from anon;
revoke all on public.social_oauth_connections from authenticated;

create index if not exists social_oauth_connections_provider_platform_idx
  on public.social_oauth_connections (provider, platform);

create index if not exists social_oauth_states_expires_at_idx
  on public.social_oauth_states (expires_at);
