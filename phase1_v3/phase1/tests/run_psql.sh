#!/bin/bash
# Runs the whole Phase 1 package against a THROWAWAY local PostgreSQL (not Supabase!).
# usage: PGHOST=... PGPORT=... PGUSER=postgres tests/run_psql.sh baseline/0000_baseline_from_queries.sql [--roundtrip]
# Needs: psql, a local server where you may create/drop database "phase1_test".
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"; BASE="$1"
psql -qAt -d postgres -c "drop database if exists phase1_test" -c "create database phase1_test" >/dev/null || exit 2
q(){ psql -q -v ON_ERROR_STOP=1 -d phase1_test "$@"; }
G="grant all on all tables in schema public to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;"
q -f "$HERE/tests/auth_stub.sql" -f "$BASE" || exit 1
q -c "$G" >/dev/null
for run in 1 2; do echo "migrations, run $run"; for f in "$HERE"/migrations/*.sql; do q -f "$f" 2>&1 | grep -v NOTICE; done; done
q -c "$G" >/dev/null
echo "tests"; q -f "$HERE/tests/phase1_rls_tests.sql" 2>&1 | sed 's/^psql:[^ ]* ERROR:  //' | grep -v -E '^(CONTEXT|PL/pgSQL)'
if [ "${2:-}" = "--roundtrip" ]; then
  echo "rollbacks (reverse)"; for f in $(ls -r "$HERE"/rollback/*.sql); do q -f "$f" 2>&1 | grep -v NOTICE; done
  echo "re-apply"; for f in "$HERE"/migrations/*.sql; do q -f "$f" 2>&1 | grep -v NOTICE; done
fi
