-- 005_sync_columns.sql  (Phase 1, item 7)  -- re-runnable
-- Live already has updated_at + triggers on all five tables and deleted_at on four of them.
-- Missing in live: plans.deleted_at. Everything else below is a safe re-assertion.
begin;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'public.set_updated_at() does not exist in this database. Create it (or tell me its real name) before running 005.';
  end if;
end $$;

alter table public.plans      add column if not exists deleted_at timestamptz;
alter table public.members    add column if not exists deleted_at timestamptz;
alter table public.payments   add column if not exists deleted_at timestamptz;
alter table public.attendance add column if not exists deleted_at timestamptz;
alter table public.expenses   add column if not exists deleted_at timestamptz;

alter table public.plans      add column if not exists updated_at timestamptz not null default now();
alter table public.members    add column if not exists updated_at timestamptz not null default now();
alter table public.payments   add column if not exists updated_at timestamptz not null default now();
alter table public.attendance add column if not exists updated_at timestamptz not null default now();
alter table public.expenses   add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at before update on public.members for each row execute function public.set_updated_at();
drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
drop trigger if exists trg_attendance_updated_at on public.attendance;
create trigger trg_attendance_updated_at before update on public.attendance for each row execute function public.set_updated_at();
drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();

create index if not exists idx_plans_updated_at_id      on public.plans (updated_at, id);
create index if not exists idx_members_updated_at_id    on public.members (updated_at, id);
create index if not exists idx_payments_updated_at_id   on public.payments (updated_at, id);
create index if not exists idx_attendance_updated_at_id on public.attendance (updated_at, id);
create index if not exists idx_expenses_updated_at_id   on public.expenses (updated_at, id);

commit;
