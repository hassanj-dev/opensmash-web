-- 003_realtime.sql  (A3 part 2)
-- Adds members, payments, attendance, expenses and plans to the supabase_realtime
-- publication so the web dashboard can refresh when the desktop app syncs.
-- Safe to run again: a table that is already in the publication is skipped.
-- Roll back with 003_realtime.down.sql.

do $$
declare
  t          text;
  tbls       text[] := array['members', 'payments', 'attendance', 'expenses', 'plans'];
  all_tables boolean;
begin
  -- Supabase always has this publication; only a plain Postgres test DB lacks it.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  select puballtables into all_tables from pg_publication where pubname = 'supabase_realtime';
  if all_tables then
    raise notice 'supabase_realtime is FOR ALL TABLES: nothing to add.';
    return;
  end if;

  foreach t in array tbls loop
    if to_regclass('public.' || t) is null then
      raise exception 'public.% does not exist: run the earlier migrations first', t;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'added public.% to supabase_realtime', t;
    else
      raise notice 'public.% already in supabase_realtime', t;
    end if;
  end loop;
end $$;

-- Check (should list all 5 tables):
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;
