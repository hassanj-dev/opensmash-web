-- Rollback of 005. Only plans.deleted_at is new; the other columns and triggers existed before.
-- WARNING: dropping plans.deleted_at deletes any soft-delete marks stored in it.
begin;
drop index if exists public.idx_plans_updated_at_id;
drop index if exists public.idx_members_updated_at_id;
drop index if exists public.idx_payments_updated_at_id;
drop index if exists public.idx_attendance_updated_at_id;
drop index if exists public.idx_expenses_updated_at_id;
alter table public.plans drop column if exists deleted_at;
commit;
