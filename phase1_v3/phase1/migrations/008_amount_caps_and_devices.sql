-- 008_amount_caps_and_devices.sql  (Phase 1, item 10, W6)  -- re-runnable
-- A. Amount caps = the real column maximum (numeric(p,s)). NOT VALID: new and edited rows are checked,
--    old rows are not (run the VALIDATE lines at the bottom once you have checked your data).
-- B. devices table. Old key-only check_license() overloads are NOT dropped here (Phase 5).
begin;

-- Helpers this file depends on must exist (fail early with a clear message).
do $$
begin
  if to_regprocedure('public.has_gym_role(uuid, public.user_role[], boolean)') is null then
    raise exception 'public.has_gym_role(uuid, user_role[], boolean) not found. Run query 2 from the README and send me the result.';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'public.set_updated_at() not found.';
  end if;
  if to_regprocedure('public.prevent_gym_id_change()') is null then
    raise exception 'public.prevent_gym_id_change() not found.';
  end if;
end $$;

-- Amount caps are read from each column's real numeric(p,s), so they always match your database.
-- The constraints are dropped and re-added on every run (NOT VALID = instant, old rows not scanned).
do $$
declare
  r record;
  v_max numeric;
begin
  for r in select * from (values
      ('payments',          'amount', 'payments_amount_range'),
      ('expenses',          'amount', 'expenses_amount_range'),
      ('plans',             'price',  'plans_price_range'),
      ('gym_subscriptions', 'amount', 'gym_subscriptions_amount_range')) as t(tbl, col, cname)
  loop
    select power(10::numeric, c.numeric_precision - c.numeric_scale) - power(10::numeric, -c.numeric_scale)
      into v_max
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
       and c.numeric_precision is not null;
    v_max := coalesce(v_max, 9999999999.99);
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.cname);
    execute format('alter table public.%I add constraint %I check (%I >= 0 and %I <= %s) not valid',
                   r.tbl, r.cname, r.col, r.col, v_max::text);
  end loop;
end $$;

create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  device_id   text not null check (btrim(device_id) <> '' and length(device_id) <= 200),
  device_name text,
  revoked     boolean not null default false,
  revoked_at  timestamptz,
  revoked_by  uuid references public.users(id) on delete set null,
  last_seen_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists idx_devices_gym_id  on public.devices (gym_id);
create index if not exists idx_devices_user_id on public.devices (user_id);

create or replace function public.devices_before_update()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if (auth.uid() is not null or current_user in ('authenticated', 'anon'))
     and not public.is_super_admin() then
    if new.user_id is distinct from old.user_id or new.device_id is distinct from old.device_id then
      raise exception 'A device cannot be moved to another user' using errcode = '42501';
    end if;
  end if;
  if new.revoked and not old.revoked then
    new.revoked_at := now(); new.revoked_by := auth.uid();
  elsif not new.revoked and old.revoked then
    new.revoked_at := null;  new.revoked_by := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
drop trigger if exists trg_devices_protect_gym_id on public.devices;
create trigger trg_devices_protect_gym_id before update on public.devices
  for each row execute function public.prevent_gym_id_change();
drop trigger if exists trg_devices_before_update on public.devices;
create trigger trg_devices_before_update before update on public.devices
  for each row execute function public.devices_before_update();

alter table public.devices enable row level security;

drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices for select to authenticated
  using ((user_id = auth.uid() and gym_id = public.get_user_gym_id())
         or public.has_gym_role(gym_id, array['gym_owner'::public.user_role, 'manager'::public.user_role], false));

drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices for insert to authenticated
  with check (user_id = auth.uid() and gym_id = public.get_user_gym_id()
              and revoked = false and revoked_at is null and revoked_by is null
              and public.has_gym_role(gym_id, array['gym_owner'::public.user_role, 'manager'::public.user_role, 'receptionist'::public.user_role], true));

drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated
  using (public.has_gym_role(gym_id, array['gym_owner'::public.user_role], true))
  with check (public.has_gym_role(gym_id, array['gym_owner'::public.user_role], true));

drop policy if exists devices_delete on public.devices;
create policy devices_delete on public.devices for delete to authenticated
  using (public.has_gym_role(gym_id, array['gym_owner'::public.user_role], true));

revoke all on public.devices from anon;
grant select, insert, update, delete on public.devices to authenticated;

commit;

-- Optional, after checking for old bad rows:
--   select count(*) from public.payments where amount < 0 or amount > 9999999999.99;
--   alter table public.payments validate constraint payments_amount_range;
--   (same for expenses_amount_range, plans_price_range, gym_subscriptions_amount_range)
