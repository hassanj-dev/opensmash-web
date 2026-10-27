-- 004_member_billing_guard.sql  (Phase 1, item 6)  -- re-runnable
-- Receptionists cannot set or change members.expiry_date / plan_id with a direct write.
-- Writes made inside the SECURITY DEFINER RPCs (create_member, renew_member) pass, because
-- current_user is the function owner there. Owners, managers and server-side writes pass.
begin;

create or replace function public.protect_member_billing_fields()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') and public.get_user_role() = 'receptionist' then
    if tg_op = 'INSERT' then
      if new.expiry_date is not null or new.plan_id is not null then
        raise exception 'Receptionists cannot set a member''s plan or expiry date directly. Use Add member or Renew.'
          using errcode = '42501';
      end if;
    elsif new.expiry_date is distinct from old.expiry_date
       or new.plan_id     is distinct from old.plan_id then
      raise exception 'Receptionists cannot change a member''s plan or expiry date directly. Use Renew.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_members_billing_guard on public.members;
create trigger trg_members_billing_guard
  before insert or update on public.members
  for each row execute function public.protect_member_billing_fields();

commit;
