-- 003_gym_protection.sql  (Phase 1, item 5)  -- re-runnable
-- Owners may change only name, phone, address and currency (desktop Settings syncs currency).
-- Everything else (including any future column) is blocked for non-super-admins.
-- The check is on current_user only (not auth.uid()): a client write runs as 'authenticated' and is
-- checked; a write made INSIDE a SECURITY DEFINER function (last_seen_at, device or sync updates,
-- Phase 3/5) runs as the function owner and passes, even when a logged-in user called it.
-- gyms.status default changes from 'active' to 'pending'.
begin;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'gym_status' and e.enumlabel = 'pending') then
    raise exception E'gym_status has no value ''pending''. Run first (in its own query, then re-run this file):\n  alter type public.gym_status add value ''pending'';';
  end if;
end $$;

create or replace function public.protect_gym_fields()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare
  c_owner_editable constant text[] := array['name', 'phone', 'address', 'currency', 'updated_at'];
begin
  if current_user in ('authenticated', 'anon') and not public.is_super_admin() then
    if (to_jsonb(new) - c_owner_editable) is distinct from (to_jsonb(old) - c_owner_editable) then
      raise exception 'Gym owners can only change the gym name, phone, address and currency'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gyms_protect_fields on public.gyms;
create trigger trg_gyms_protect_fields
  before update on public.gyms
  for each row execute function public.protect_gym_fields();

alter table public.gyms alter column status set default 'pending';

commit;
