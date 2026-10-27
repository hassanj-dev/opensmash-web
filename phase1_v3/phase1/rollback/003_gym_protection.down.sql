-- Rollback of 003: restores the live protect_gym_fields() and the 'active' default.
begin;

CREATE OR REPLACE FUNCTION public.protect_gym_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.status           is distinct from old.status
    or new.suspended_at     is distinct from old.suspended_at
    or new.suspended_reason is distinct from old.suspended_reason
    or new.expires_at       is distinct from old.expires_at
    or new.license_key      is distinct from old.license_key
    or new.device_id        is distinct from old.device_id
    or new.last_seen_at     is distinct from old.last_seen_at then
      raise exception 'Only a super_admin can change gym status or license fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

alter table public.gyms alter column status set default 'active';

commit;
