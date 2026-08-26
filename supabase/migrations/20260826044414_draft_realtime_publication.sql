-- Big Exec Draft Night: realtime publication coverage for draft recovery.

alter table public.drafts replica identity full;
alter table public.draft_picks replica identity full;
alter table public.draft_queues replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and n.nspname = 'public'
        and c.relname = 'drafts'
    ) then
      alter publication supabase_realtime add table public.drafts;
    end if;

    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and n.nspname = 'public'
        and c.relname = 'draft_picks'
    ) then
      alter publication supabase_realtime add table public.draft_picks;
    end if;

    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and n.nspname = 'public'
        and c.relname = 'draft_queues'
    ) then
      alter publication supabase_realtime add table public.draft_queues;
    end if;
  end if;
end $$;
