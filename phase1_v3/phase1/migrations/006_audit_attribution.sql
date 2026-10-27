-- 006_audit_attribution.sql  (Phase 1, item 8)  -- re-runnable
begin;

-- A. Attribution defaults (already set in live; re-asserted)
alter table public.payments   alter column recorded_by set default auth.uid();
alter table public.expenses   alter column recorded_by set default auth.uid();
alter table public.attendance alter column check_in    set default now();

-- B. Audit writer. Runs as definer so clients never need INSERT rights for it.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  c_skip constant text[] := array['updated_at','created_at','license_key','device_id','last_seen_at'];
  v_row     jsonb;
  v_old     jsonb := '{}'::jsonb;
  v_gym     uuid;
  v_uid     uuid := auth.uid();
  v_action  text;
  v_changes jsonb := '{}'::jsonb;
  v_details jsonb;
  v_key     text;
begin
  -- Bulk server paths (Phase 3 sync) run `select set_config('app.skip_audit','on',true)` inside their
  -- SECURITY DEFINER function and write ONE summary audit row instead of one row per synced record.
  -- Clients cannot set this: PostgREST only exposes public functions, not set_config().
  if current_setting('app.skip_audit', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;

  v_gym := case when tg_table_name = 'gyms' then (v_row->>'id')::uuid
                else nullif(v_row->>'gym_id', '')::uuid end;

  -- Gym already gone (cascade delete): skip, except the gym's own DELETE row, logged with no gym.
  if v_gym is not null and not exists (select 1 from public.gyms g where g.id = v_gym) then
    if tg_table_name = 'gyms' and tg_op = 'DELETE' then
      v_gym := null;
    else
      return null;
    end if;
  end if;

  -- Never let a missing profile row break the real write.
  if v_uid is not null and not exists (select 1 from public.users u where u.id = v_uid) then
    v_uid := null;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_row) loop
      if v_key <> all (c_skip) and (v_row->v_key) is distinct from (v_old->v_key) then
        v_changes := v_changes || jsonb_build_object(v_key,
                       jsonb_build_object('old', v_old->v_key, 'new', v_row->v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;                       -- only skipped columns changed
    end if;
    v_action := case
      when (v_row->>'deleted_at') is not null and (v_old->>'deleted_at') is null then 'soft_delete'
      when (v_row->>'deleted_at') is null     and (v_old->>'deleted_at') is not null then 'restore'
      else 'update' end;
    v_details := jsonb_build_object('record_id', v_row->>'id', 'changes', v_changes);
  else
    v_action  := lower(tg_op);
    v_details := jsonb_build_object('record_id', v_row->>'id', 'row', v_row - c_skip);
  end if;

  insert into public.audit_log (gym_id, user_id, action, details)
  values (v_gym, v_uid, tg_table_name || '.' || v_action, v_details);
  return null;
end $fn$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['gyms','users','plans','members','payments','expenses','settings'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', 'trg_' || t || '_audit', t);
  end loop;
end $$;

-- Attendance is noisy: log only hard deletes and soft deletes / restores.
drop trigger if exists trg_attendance_audit_delete on public.attendance;
create trigger trg_attendance_audit_delete after delete on public.attendance
  for each row execute function public.audit_row_change();
drop trigger if exists trg_attendance_audit_soft_delete on public.attendance;
create trigger trg_attendance_audit_soft_delete after update on public.attendance
  for each row when (old.deleted_at is distinct from new.deleted_at)
  execute function public.audit_row_change();

-- C. Policies: inserts must be your own user_id; managers get read-only access to their gym's log.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (user_id = auth.uid() and (public.is_super_admin() or gym_id = public.get_user_gym_id()));

drop policy if exists audit_select_manager on public.audit_log;
create policy audit_select_manager on public.audit_log for select to authenticated
  using (public.has_gym_role(gym_id, array['manager'::public.user_role], false));

-- D. recorded_by cannot be rewritten after the fact (except by a super admin / server).
create or replace function public.protect_recorded_by()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.recorded_by is distinct from old.recorded_by
     and (auth.uid() is not null or current_user in ('authenticated', 'anon'))
     and not public.is_super_admin() then
    raise exception 'The person who recorded this entry cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_payments_protect_recorded_by on public.payments;
create trigger trg_payments_protect_recorded_by before update on public.payments
  for each row execute function public.protect_recorded_by();
drop trigger if exists trg_expenses_protect_recorded_by on public.expenses;
create trigger trg_expenses_protect_recorded_by before update on public.expenses
  for each row execute function public.protect_recorded_by();

commit;
