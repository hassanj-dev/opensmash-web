-- 007_clear_must_change_password.sql  (Phase 1, item 9, W4)  -- re-runnable
-- Self-only: a signed-in, active user clears their own flag. Cannot touch anyone else.
begin;

create or replace function public.clear_must_change_password()
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = v_uid and is_active is true) then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  update public.users set must_change_password = false
   where id = v_uid and must_change_password;
  return true;
end $fn$;

revoke all on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;

commit;
