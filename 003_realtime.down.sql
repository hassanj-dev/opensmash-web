-- 003_realtime.down.sql
-- Removes only the five tables that 003_realtime.sql adds. Safe to run again.
-- The web dashboard keeps working: it falls back to its 30 second refresh.

do $$
declare
  t    text;
  tbls text[] := array['members', 'payments', 'attendance', 'expenses', 'plans'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime is FOR ALL TABLES: nothing to remove.';
    return;
  end if;

  foreach t in array tbls loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
      raise notice 'removed public.% from supabase_realtime', t;
    end if;
  end loop;
end $$;
