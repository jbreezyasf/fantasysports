-- Big Exec Operations Portal Phase 1.
-- Read-first internal access roles and audit trail for beta support operations.

create table if not exists public.ops_staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','ops_manager','support','content_manager','read_only')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  disabled_at timestamptz
);

create index if not exists ops_staff_roles_user_active_idx
  on public.ops_staff_roles(user_id, disabled_at, created_at desc);

create table if not exists public.ops_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_events_created_idx
  on public.ops_audit_events(created_at desc);

create index if not exists ops_audit_events_target_idx
  on public.ops_audit_events(target_type, target_id, created_at desc);

alter table public.ops_staff_roles enable row level security;
alter table public.ops_audit_events enable row level security;

drop policy if exists ops_staff_roles_self_read on public.ops_staff_roles;
create policy ops_staff_roles_self_read on public.ops_staff_roles
  for select
  to authenticated
  using (user_id = auth.uid() and disabled_at is null);

drop policy if exists ops_audit_events_staff_read on public.ops_audit_events;
create policy ops_audit_events_staff_read on public.ops_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ops_staff_roles osr
      where osr.user_id = auth.uid()
        and osr.disabled_at is null
        and osr.role in ('super_admin','ops_manager','support','read_only')
    )
  );

grant select on public.ops_staff_roles to authenticated;
grant select on public.ops_audit_events to authenticated;
grant all on public.ops_staff_roles to service_role;
grant all on public.ops_audit_events to service_role;
