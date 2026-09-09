-- Add limited IT staff access for delegated technical support work.
-- IT staff may troubleshoot and propose changes, but owner-only staff
-- management and destructive delete authority remain excluded.

alter table public.ops_staff_roles
  drop constraint if exists ops_staff_roles_role_check;

alter table public.ops_staff_roles
  add constraint ops_staff_roles_role_check
  check (role in ('super_admin','ops_manager','support','content_manager','it_staff','read_only'));
