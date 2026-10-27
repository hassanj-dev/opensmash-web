-- Rollback of 006. Existing audit_log rows are kept.
begin;

do $$
declare t text;
begin
  foreach t in array array['gyms','users','plans','members','payments','expenses','settings'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_audit', t);
  end loop;
end $$;
drop trigger if exists trg_attendance_audit_delete on public.attendance;
drop trigger if exists trg_attendance_audit_soft_delete on public.attendance;
drop trigger if exists trg_payments_protect_recorded_by on public.payments;
drop trigger if exists trg_expenses_protect_recorded_by on public.expenses;
drop function if exists public.audit_row_change();
drop function if exists public.protect_recorded_by();

drop policy if exists audit_select_manager on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (public.is_super_admin() or ((user_id = auth.uid()) and (gym_id = public.get_user_gym_id())));

commit;
