# Phase 1 – database foundation and security (v2, corrected)

v2 fixes the problems found in review of v1 (see "What changed in v2"). It was run twice, rolled back and
re-applied on a real PostgreSQL 16 against a STAND-IN schema (177 checks, 0 failed). It has NOT been run on your
live Supabase database. Read "Not verified" and use a staging project first.

## Files
- `migrations/001…008_*.sql`  numbered, re-runnable (each has its own begin/commit)
- `rollback/001…008_*.down.sql`  undo each one (run in reverse order)
- `tests/phase1_rls_tests.sql`  RLS test suite (Supabase SQL editor or PGlite)
- `tests/run_pglite.js`  PGlite runner: baseline -> migrations x2 -> tests -> optional rollback round trip

| # | Items | What it does |
|---|-------|--------------|
| 001 | 2 | `is_gym_active` checks `expires_at`; `get_user_role/gym_id` return NULL for deactivated users; helpers pinned; `gym_subscriptions` policy uses `is_super_admin()` |
| 002 | 3, 4, 10 | `create_member`/`renew_member` become SECURITY DEFINER with explicit checks, anon blocked; receptionists must pay the full plan price and use a join date within -7/+1 days; `normalize_phone()`; **unique** phone index; `max_payment_amount()` read from the real column; Karachi defaults for `join_date`, `spent_on` |
| 003 | 5 | owners can change only name/phone/address/currency; checked by `current_user` so definer functions can still write gyms; `gyms.status` default `pending` |
| 004 | 6 | trigger: receptionists cannot set or change member plan/expiry directly |
| 005 | 7 | `plans.deleted_at`; `(updated_at, id)` indexes; `updated_at` triggers re-asserted |
| 006 | 8 | audit triggers (use `auth.uid()`), `audit_insert` needs `user_id = auth.uid()`, manager read-only viewer, `recorded_by` locked |
| 007 | 9 | `clear_must_change_password()` self-only RPC |
| 008 | 10 | amount `CHECK`s sized from each real column (`NOT VALID`), `devices` table with RLS |

## How to apply (you apply SQL by hand: `supabase_migrations` does not exist)
1. Take a backup, or try on a Supabase branch / staging project first.
2. In the SQL editor, run 001, 002 … 008 in order, one file per query. Run each one twice; the second run must not error.
3. Run `tests/phase1_rls_tests.sql` (optional first: `select pg_get_functiondef(...)` above).
    It always ends with an error by design (that rolls everything back). The error text starts with `PHASE1 TEST REPORT: N passed, M failed` and lists every check.
4. If anything goes wrong, run the `.down.sql` files in reverse order (008 first).

## What changed in v2
1. `create_member`: a receptionist with a plan must pay at least the plan price (manager/owner may discount) and the join date must be within 7 days back and 1 day ahead. `renew_member`: same price rule for receptionists.
2. Unique index on `(gym_id, normalize_phone(phone))` for active, non-deleted members, so direct edits, reactivation, sync and simultaneous adds cannot create duplicates. If duplicates already exist, 002 prints a WARNING with the query to find them and skips the index; fix them and run 002 again.
3. Amount caps are read from the real column precision (`numeric(10,2)` or `(12,2)`), in both the constraints (008) and the RPCs (`max_payment_amount()`).
4. 003: `currency` is owner-editable (desktop Settings syncs it). The guard looks at `current_user` only, so a SECURITY DEFINER function (last_seen_at, device or sync writes) works even when a logged-in user called it.
5. Audit flood: bulk server code can run `select set_config('app.skip_audit','on',true);` inside its SECURITY DEFINER function to skip row audits and write one summary row. Remove the web app's own `logAudit` calls, or you will get duplicates.
6. 005 and 008 stop early with a clear message if `set_updated_at()`, `prevent_gym_id_change()` or `has_gym_role(uuid, user_role[], boolean)` is missing. 008 now passes the third `has_gym_role` argument explicitly (`true` for writes).
7. Tests: fixture bug fixed (gym insert now sets owner_email and owner_name); the "owner cannot change status" test set the status to its current value, so it could never fail; new tests for every fix above.
8. Your trigger list matched the names 005 expects, so no duplicate `updated_at` triggers.

## Item 1: baseline
`baseline/0000_baseline_from_queries.sql` is rebuilt from the query results you sent (columns, all functions verbatim, all policies, indexes). Not included, so guessed: enum labels (`gym_status`, `user_role`, `payment_method`, `gender_type`), the `users` columns after `full_name`, constraints, foreign keys, and trigger names on `gyms`/`users`/`settings`. It is for testing only: never run it on live. Replace it with a real dump when you can (`supabase db dump --schema public`, needs Docker) and keep it in `baseline/`, NOT in `migrations/` (the runners execute every file in `migrations/` twice).
Confirmed from your results: amounts are `numeric(12,2)` (cap 9,999,999,999.99), `has_gym_role(uuid, user_role[], boolean default true)` where the 3rd argument is "require active gym", and `set_updated_at()` / `prevent_gym_id_change()` exist.
Still needed from you (one query): `select enumtypid::regtype, enumlabel from pg_enum order by 1, enumsortorder;` Migration 003 needs `gym_status` to contain `pending` and stops with a clear message if not.

## Found already done in live (no change made)
`set_receipt_no` uses Asia/Karachi; `recorded_by` defaults to `auth.uid()`; `check_in` defaults to `now()`; `updated_at` + triggers on all five tables; `deleted_at` on members, payments, attendance, expenses. Your `types.ts` is out of date: `Payment` and `Plan` both lack `deleted_at` (app change, later phase).

## Behaviour changes to confirm
1. New self-signups are `pending` (`handle_new_user` sets no status). A super admin must activate them.
2. Owners can no longer edit `owner_name`, `owner_email` (currency stays editable).
3. Suspended and expired gyms can still READ. Live `can_read_gym` ignores status; the old test expected 0 rows. Writes are blocked. Decide if you want reads blocked.
4. Receptionists cannot insert a member with a plan or expiry directly (desktop sync must use the RPCs for these). Receptionists also cannot sell below the plan price.
5. `recorded_by` cannot be changed after insert (except super admin / server).
6. Managers can read the gym audit log (my reading of "read-only audit viewer").
7. `renew_member` works only within the caller's own gym (a super admin with no gym can no longer call it).
8. Amounts must be between 0 and the column maximum for payments, expenses, plan prices and gym subscriptions. A negative refund row would now be rejected.
9. If the web app also writes audit rows by hand, you will get duplicates now that triggers write them.
10. Not changed: `check_license` overloads (drop in Phase 5), the unused `protect_user_critical_fields()` and `update_updated_at()` functions.

## Not verified
- Executed only on a stand-in schema I wrote from your rollback files and old schema, on local PostgreSQL 16. Your live policies and function bodies may differ, so treat a pass as strong evidence, not proof. Run `tests/phase1_rls_tests.sql` on staging.
- Not run: `run_pglite.js` (PGlite could not be installed here). `tests/run_psql.sh` is the runner that was used.
- The third argument of `has_gym_role` is assumed to mean "require an active gym" (006 passes `false` for reads). Check with: `select pg_get_functiondef('public.has_gym_role(uuid, user_role[], boolean)'::regprocedure);`
- 007 still lets a user clear the flag without changing the password (Postgres cannot see that from `public`). Do it from a server route using the Supabase admin API in a later phase.
- The item 6 trigger tells "direct client write" from "inside an RPC" using `current_user`. That works only if the RPC owner is `postgres` (or any role other than `authenticated`/`anon`) and PostgREST switches to `authenticated`. Test 9/10 checks this.
- The test script inserts rows into `auth.users`. If your project has extra NOT NULL auth columns or a signup trigger beyond `handle_new_user`, fixtures may fail.
- `run_pglite.js` and `run_psql.sh` need your real baseline; a Supabase dump may include lines PGlite rejects.
- W4 and W6 were not in the files I got; I followed your descriptions (self-only RPC, amount caps).
- `must_change_password` is cleared only in `public.users`. If the web app also keeps it in JWT `app_metadata`, that copy is not touched.
- `(updated_at, id)` indexes are as you asked; a sync pull filtered by gym may prefer `(gym_id, updated_at, id)`.

## Hand test checklist
1. Run the migrations twice in order; no errors. Run the test script; report says `0 failed`.
2. Sign up a new owner in the web app. In the SQL editor: `select status from gyms order by created_at desc limit 1;` -> `pending`. Activate it with a super admin.
3. As a receptionist: add a member with a plan and a payment (works, receipt number appears). Renew that member (works).
4. As the same receptionist, try to change a member's expiry through any direct edit (API or table editor with their token). It must fail with "Receptionists cannot change...".
5. As a manager: edit a member's expiry directly. It works.
6. As an owner: change gym name, phone, address (works). Try currency or email (fails).
7. Suspend a gym in the super admin page. Staff can look but not add, edit or renew. Set `expires_at` in the past: same result.
8. Deactivate a receptionist. Their next request sees no data and cannot add members.
9. Add a phone "0311 222-3333", then add another member with "0311-2223333": `DUPLICATE_PHONE`.
10. Add a payment at 01:00 Karachi time (or set `paid_at` to 20:30 UTC the day before): receipt starts with the Karachi date.
11. `select action, user_id, details from audit_log order by created_at desc limit 10;` shows who changed what.
12. Log in a staff account created with `must_change_password`, change the password, call `select clear_must_change_password();` as that user; flag becomes false.
13. Try to record a payment of -5 and of 10000000000: both rejected.
14. Run each `.down.sql` in reverse, then the migrations again; no errors.
