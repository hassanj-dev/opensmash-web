/**
 * Phase 1 runner for PGlite (PostgreSQL in WASM).
 *
 * Usage:  node run_pglite.js path/to/0000_baseline.sql [--roundtrip]
 *
 * You must supply the baseline: a dump of your LIVE public schema, e.g.
 *   supabase db dump --schema public -f 0000_baseline.sql
 * Steps: auth stub + roles -> baseline -> migrations (twice, to prove they are re-runnable)
 *        -> RLS tests -> (with --roundtrip) all rollbacks, then migrations again.
 * NOT VERIFIED against a real dump yet: Supabase dumps may contain extension/owner/grant lines
 * that PGlite rejects. If so, delete those lines from your copy of the baseline.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const list = (dir, suffix) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(suffix)).sort();

const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
-- Same behaviour as Supabase: read the JWT claims from session settings.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;
const GRANTS = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

async function runDir(db, dir, suffix, label, reverse = false) {
  let files = list(dir, suffix);
  if (reverse) files = files.reverse();
  for (const f of files) {
    try {
      await db.exec(read(path.join(root, dir, f)));
      console.log(`  ok   ${label} ${f}`);
    } catch (e) {
      console.log(`  FAIL ${label} ${f}: ${e.message}`);
      throw e;
    }
  }
}

(async () => {
  const baseline = process.argv[2];
  if (!baseline || baseline.startsWith('--')) {
    console.error('Usage: node run_pglite.js path/to/0000_baseline.sql [--roundtrip]');
    process.exit(2);
  }
  const roundtrip = process.argv.includes('--roundtrip');
  const db = new PGlite();
  let exitCode = 1;
  try {
    console.log('1. auth stub + roles');
    await db.exec(AUTH_STUB);
    console.log('2. baseline');
    await db.exec(read(baseline));
    await db.exec(GRANTS);
    console.log('3. migrations, first run');
    await runDir(db, 'migrations', '.sql', 'up');
    console.log('4. migrations, second run (re-runnable check)');
    await runDir(db, 'migrations', '.sql', 'up');
    await db.exec(GRANTS);

    console.log('5. RLS tests');
    try {
      await db.exec(read(path.join(__dirname, 'phase1_rls_tests.sql')));
      console.log('  The test script did not produce a report. Something is wrong.');
    } catch (e) {
      const msg = e.message || String(e);
      console.log(msg);
      exitCode = /PHASE1 TEST REPORT: \d+ passed, 0 failed/.test(msg) ? 0 : 1;
    } finally {
      try { await db.exec('ROLLBACK'); } catch (_) { /* nothing to roll back */ }
    }

    if (roundtrip) {
      console.log('6. rollbacks (reverse order), then migrations again');
      await runDir(db, 'rollback', '.down.sql', 'down', true);
      await runDir(db, 'migrations', '.sql', 'up');
    }
  } catch (e) {
    console.error('Runner stopped:', e.message || e);
    exitCode = 1;
  } finally {
    await db.close();
  }
  process.exit(exitCode);
})();
