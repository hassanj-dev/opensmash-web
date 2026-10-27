set check_function_bodies = off;
create type public.user_role as enum ('super_admin','gym_owner','manager','receptionist');
create type public.payment_method as enum ('cash','card','bank_transfer','online');
create type public.gym_status as enum ('active','pending','suspended','inactive');
create type public.gender_type as enum ('male','female','other');
create table public.gyms (
  id uuid not null default gen_random_uuid(),
  name text not null,
  owner_email text,
  owner_name text,
  phone text,
  address text,
  currency text not null default 'Rs'::text,
  status public.gym_status not null default 'active'::gym_status,
  suspended_at timestamp with time zone,
  suspended_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  license_key text default replace((gen_random_uuid())::text, '-'::text, ''::text),
  expires_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  device_id text,
  primary key (id)
);
create table public.users (
  id uuid not null,
  gym_id uuid,
  email text not null,
  full_name text,
  role public.user_role not null default 'receptionist'::user_role,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id),
  foreign key (id) references auth.users(id) on delete cascade
);
create table public.plans (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  name text not null,
  duration_months integer not null,
  price numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);
create table public.members (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  code text not null,
  name text not null,
  phone text,
  email text,
  gender public.gender_type,
  address text,
  date_of_birth date,
  join_date date not null default CURRENT_DATE,
  plan_id uuid,
  expiry_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  primary key (id)
);
create table public.payments (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  member_id uuid not null,
  plan_id uuid,
  receipt_no text not null,
  amount numeric(12,2) not null,
  payment_method public.payment_method not null default 'cash'::payment_method,
  paid_at timestamp with time zone not null default now(),
  note text,
  recorded_by uuid default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  primary key (id)
);
create table public.attendance (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  member_id uuid not null,
  check_in timestamp with time zone not null default now(),
  check_out timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  primary key (id)
);
create table public.expenses (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  category text not null,
  amount numeric(12,2) not null,
  spent_on date not null default CURRENT_DATE,
  note text,
  recorded_by uuid default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  primary key (id)
);
create table public.settings (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  key text not null,
  value text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);
create table public.gym_subscriptions (
  id uuid not null default gen_random_uuid(),
  gym_id uuid not null,
  billing_month date not null,
  amount numeric(12,2) not null,
  is_paid boolean not null default false,
  paid_at timestamp with time zone,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);
create table public.audit_log (
  id uuid not null default gen_random_uuid(),
  gym_id uuid,
  user_id uuid,
  action text not null,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);
alter table public.users add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.plans add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.members add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.members add foreign key (plan_id) references public.plans(id);
alter table public.payments add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.payments add foreign key (member_id) references public.members(id) on delete cascade;
alter table public.payments add foreign key (plan_id) references public.plans(id);
alter table public.attendance add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.attendance add foreign key (member_id) references public.members(id) on delete cascade;
alter table public.expenses add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.settings add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.gym_subscriptions add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.audit_log add foreign key (gym_id) references public.gyms(id) on delete cascade;
alter table public.users add unique (email);
alter table public.settings add unique (gym_id,key);
alter table public.gym_subscriptions add unique (gym_id,billing_month);
alter table public.gyms add unique (license_key);
CREATE INDEX idx_attendance_gym_in ON public.attendance USING btree (gym_id, check_in DESC);
CREATE INDEX idx_attendance_member ON public.attendance USING btree (member_id, check_in DESC);
CREATE INDEX idx_audit_gym_created ON public.audit_log USING btree (gym_id, created_at DESC);
CREATE INDEX idx_audit_user_id ON public.audit_log USING btree (user_id);
CREATE INDEX idx_expenses_gym_spent ON public.expenses USING btree (gym_id, spent_on DESC);
CREATE INDEX idx_members_expiry ON public.members USING btree (gym_id, expiry_date);
CREATE INDEX idx_members_gym_id ON public.members USING btree (gym_id);
CREATE INDEX idx_members_plan_id ON public.members USING btree (plan_id);
CREATE INDEX members_gym_active_idx ON public.members USING btree (gym_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_members_gym_code ON public.members USING btree (gym_id, code);
CREATE INDEX idx_payments_gym_paid ON public.payments USING btree (gym_id, paid_at DESC);
CREATE INDEX idx_payments_member ON public.payments USING btree (member_id);
CREATE INDEX idx_payments_plan_id ON public.payments USING btree (plan_id);
CREATE UNIQUE INDEX uq_payments_gym_receipt ON public.payments USING btree (gym_id, receipt_no);
CREATE INDEX idx_plans_gym_id ON public.plans USING btree (gym_id);
CREATE INDEX idx_settings_gym_id ON public.settings USING btree (gym_id);
CREATE INDEX idx_users_gym_id ON public.users USING btree (gym_id);
CREATE OR REPLACE FUNCTION public.can_read_gym(p_gym_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
      OR (p_gym_id IS NOT NULL AND p_gym_id = public.get_user_gym_id());
$function$
;
CREATE OR REPLACE FUNCTION public.check_license(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g record;
  v_status text;
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('status','invalid','gym_name','','valid_until','','server_time',v_now);
  end if;

  select name, status::text as status, expires_at into g
    from gyms where license_key = btrim(p_key) limit 1;

  if not found then
    return jsonb_build_object('status','invalid','gym_name','','valid_until','','server_time',v_now);
  end if;

  if g.status = 'active' then
    if g.expires_at is null or g.expires_at > now() then v_status := 'active';
    else v_status := 'expired';
    end if;
  else
    -- suspended, pending, inactive: all blocked
    v_status := 'suspended';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'gym_name', g.name,
    'valid_until', coalesce(to_char(g.expires_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
    'server_time', v_now
  );
end; $function$
;
CREATE OR REPLACE FUNCTION public.check_license(p_key text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.gyms%rowtype; st text;
begin
  select * into g from public.gyms where license_key = p_key;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if g.device_id is null then
    update public.gyms set device_id = p_device where id = g.id;
  elsif g.device_id <> p_device then
    return jsonb_build_object('status', 'device_mismatch');
  end if;
  st := g.status;
  if g.expires_at is not null and g.expires_at < now() then st := 'expired'; end if;
  update public.gyms set last_seen_at = now() where id = g.id;
  return jsonb_build_object('status', st, 'gym_name', g.name, 'expires_at', g.expires_at, 'server_time', now());
end; $function$
;
CREATE OR REPLACE FUNCTION public.create_member(p_name text, p_phone text, p_plan_id uuid, p_join_date date, p_amount numeric DEFAULT 0, p_method payment_method DEFAULT 'cash'::payment_method)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_gym   uuid := public.get_user_gym_id();
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_join  date := coalesce(p_join_date, v_today);
  v_exp   date;
  v_receipt text;
  pl  public.plans%rowtype;
  m   public.members%rowtype;
  pay public.payments%rowtype;
begin
  if v_gym is null then
    raise exception 'No gym linked to this account' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Name required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 or p_amount >= 'Infinity'::numeric then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;

  if v_phone is not null and exists (
       select 1 from public.members
        where gym_id = v_gym and is_active and deleted_at is null
          and regexp_replace(coalesce(phone, ''), '[\\s-]', '', 'g')
            = regexp_replace(v_phone, '[\\s-]', '', 'g')) then
    raise exception 'DUPLICATE_PHONE' using errcode = '23505';
  end if;

  if p_plan_id is not null then
    select * into pl from public.plans
     where id = p_plan_id and gym_id = v_gym and is_active;
    if not found then
      raise exception 'Plan not found or inactive' using errcode = 'P0002';
    end if;
    v_exp := (v_join + make_interval(months => pl.duration_months))::date;
  end if;

  insert into public.members (gym_id, code, name, phone, plan_id, join_date, expiry_date)
  values (v_gym, '', btrim(p_name), v_phone, p_plan_id, v_join, v_exp)
  returning * into m;

  if p_amount > 0 then
    insert into public.payments (gym_id, member_id, plan_id, amount, payment_method)
    values (v_gym, m.id, p_plan_id, p_amount, p_method)
    returning * into pay;
    v_receipt := pay.receipt_no;
  end if;

  return jsonb_build_object(
    'member_id', m.id, 'code', m.code,
    'receipt_no', v_receipt, 'expiry_date', v_exp);
end $function$
;
CREATE OR REPLACE FUNCTION public.dashboard_money(p_gym_id uuid, p_from_ts timestamp with time zone, p_from_date date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'revenue',  coalesce((select sum(amount) from public.payments where gym_id = p_gym_id and paid_at >= p_from_ts), 0),
    'expenses', coalesce((select sum(amount) from public.expenses where gym_id = p_gym_id and spent_on >= p_from_date), 0));
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_gym_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select gym_id from public.users where id = auth.uid() $function$
;
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.users where id = auth.uid() $function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gym_id   uuid;
  v_email    text := COALESCE(NEW.email, NEW.id::text || '@no-email.invalid');
  v_name     text := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(v_email, '@', 1));
  v_gym_name text := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'gym_name'), ''), v_name || '''s Gym');
  v_role     public.user_role;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Staff: server-side admin API se app_metadata {gym_id, role, must_change_password}
  IF NEW.raw_app_meta_data->>'gym_id' IS NOT NULL THEN
    v_role := COALESCE(NULLIF(NEW.raw_app_meta_data->>'role', ''), 'receptionist')::public.user_role;
    IF v_role = 'super_admin' THEN v_role := 'receptionist'; END IF;

    INSERT INTO public.users (id, gym_id, email, full_name, role, must_change_password)
    VALUES (NEW.id, (NEW.raw_app_meta_data->>'gym_id')::uuid, v_email, v_name, v_role,
            COALESCE((NEW.raw_app_meta_data->>'must_change_password')::boolean, false));
    RETURN NEW;
  END IF;

  -- Normal signup: naya gym + owner
  INSERT INTO public.gyms (name, owner_email, owner_name)
  VALUES (v_gym_name, v_email, v_name)
  RETURNING id INTO v_gym_id;

  INSERT INTO public.users (id, gym_id, email, full_name, role)
  VALUES (NEW.id, v_gym_id, v_email, v_name, 'gym_owner');

  INSERT INTO public.plans (gym_id, name, duration_months, price) VALUES
    (v_gym_id, 'Monthly',      1,  3000),
    (v_gym_id, 'Quarterly',    3,  8000),
    (v_gym_id, 'Half Yearly',  6, 15000),
    (v_gym_id, 'Yearly',      12, 28000);

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.has_gym_role(p_gym_id uuid, p_roles user_role[], p_require_active boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
      OR COALESCE(
           p_gym_id IS NOT NULL
           AND p_gym_id = public.get_user_gym_id()
           AND public.get_user_role() = ANY (p_roles)
           AND (NOT p_require_active OR public.is_gym_active(p_gym_id)),
           false);
$function$
;
CREATE OR REPLACE FUNCTION public.is_gym_active(p_gym_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select status = 'active' from public.gyms where id = p_gym_id), false) $function$
;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() = 'super_admin', false);
$function$
;
CREATE OR REPLACE FUNCTION public.member_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with t as (select (now() at time zone 'Asia/Karachi')::date as d)
  select jsonb_build_object(
    'total',       count(*),
    'active',      count(*) filter (where m.expiry_date >= t.d),
    'expired',     count(*) filter (where m.expiry_date <  t.d),
    'expiring_7d', count(*) filter (where m.expiry_date between t.d and t.d + 7)
  )
  from public.members m cross join t
  where m.gym_id = public.get_user_gym_id()
    and m.is_active and m.deleted_at is null
$function$
;
CREATE OR REPLACE FUNCTION public.payments_filtered_summary(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_method payment_method DEFAULT NULL::payment_method, p_receipt text DEFAULT NULL::text, p_member_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('total', coalesce(sum(amount), 0), 'count', count(*))
    from public.payments
   where gym_id = public.get_user_gym_id()
     and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at < p_to)
     and (p_method is null or payment_method = p_method)
     and (p_receipt is null or position(lower(p_receipt) in lower(receipt_no)) > 0
          or (p_member_ids is not null and member_id = any (p_member_ids)))
$function$
;
CREATE OR REPLACE FUNCTION public.payments_summary(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('total', coalesce(sum(amount), 0), 'count', count(*))
    from public.payments
   where gym_id = public.get_user_gym_id() and paid_at >= p_from and paid_at < p_to
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_gym_id_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gym_id IS DISTINCT FROM OLD.gym_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'gym_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$
;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.protect_member_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null
     and coalesce(public.get_user_role()::text, '') not in ('gym_owner', 'manager', 'super_admin') then
    raise exception 'Only owner or manager can remove members' using errcode = '42501';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.protect_user_critical_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.role = 'super_admin' then
      if (select role from users where id = auth.uid()) != 'super_admin' then
        raise exception 'Only super admins can create super_admin users';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.role = 'super_admin' and old.role != 'super_admin' then
      if (select role from users where id = auth.uid()) != 'super_admin' then
        raise exception 'Cannot promote user to super_admin';
      end if;
    end if;
    if new.gym_id is distinct from old.gym_id then
      if (select role from users where id = auth.uid()) != 'super_admin' then
        raise exception 'Cannot change gym_id';
      end if;
    end if;
    if new.id = auth.uid() and new.is_active = false and old.is_active = true then
      raise exception 'Cannot deactivate own account';
    end if;
  end if;

  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.protect_user_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Only a super_admin can create a super_admin' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super_admin can grant super_admin' USING ERRCODE = '42501';
  END IF;

  IF NEW.id = auth.uid()
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'You cannot change your own role or active status' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND public.get_user_role() <> 'gym_owner' THEN
    RAISE EXCEPTION 'Only a gym_owner can change roles' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.renew_member(p_member_id uuid, p_plan_id uuid, p_amount numeric, p_method payment_method DEFAULT 'cash'::payment_method, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  m       public.members%rowtype;
  pl      public.plans%rowtype;
  pay     public.payments%rowtype;
  today   date := (now() at time zone 'Asia/Karachi')::date;
  base    date;
  new_exp date;
begin
  if p_amount is null or p_amount <= 0 or p_amount >= 'Infinity'::numeric then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;

  select * into m from public.members
   where id = p_member_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Member not found or not allowed' using errcode = 'P0002';
  end if;

  select * into pl from public.plans
   where id = p_plan_id and gym_id = m.gym_id and is_active;
  if not found then
    raise exception 'Plan not found or inactive' using errcode = 'P0002';
  end if;

  base    := greatest(today, coalesce(m.expiry_date, today));
  new_exp := (base + make_interval(months => pl.duration_months))::date;

  update public.members
     set plan_id = pl.id, expiry_date = new_exp
   where id = m.id;

  insert into public.payments (gym_id, member_id, plan_id, amount, payment_method, note)
  values (m.gym_id, m.id, pl.id, p_amount, p_method, p_note)
  returning * into pay;

  return jsonb_build_object(
    'payment_id', pay.id, 'receipt_no', pay.receipt_no, 'expiry_date', new_exp);
end $function$
;
CREATE OR REPLACE FUNCTION public.report_summary(p_gym_id uuid, p_from_ts timestamp with time zone, p_to_ts timestamp with time zone, p_from_date date, p_to_date date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'payments_count', (select count(*) from public.payments
        where gym_id = p_gym_id and deleted_at is null and paid_at >= p_from_ts and paid_at < p_to_ts),
    'expenses_count', (select count(*) from public.expenses
        where gym_id = p_gym_id and deleted_at is null and spent_on >= p_from_date and spent_on <= p_to_date),
    'payments_by_month', coalesce((
        select json_agg(json_build_object('key', k, 'total', t) order by k)
        from (select to_char(paid_at at time zone 'Asia/Karachi', 'YYYY-MM') as k, sum(amount) as t
              from public.payments
              where gym_id = p_gym_id and deleted_at is null and paid_at >= p_from_ts and paid_at < p_to_ts
              group by 1) x), '[]'::json),
    'payments_by_method', coalesce((
        select json_agg(json_build_object('key', k, 'total', t) order by t desc)
        from (select coalesce(payment_method::text, 'Other') as k, sum(amount) as t
              from public.payments
              where gym_id = p_gym_id and deleted_at is null and paid_at >= p_from_ts and paid_at < p_to_ts
              group by 1) x), '[]'::json),
    'expenses_by_month', coalesce((
        select json_agg(json_build_object('key', k, 'total', t) order by k)
        from (select to_char(spent_on, 'YYYY-MM') as k, sum(amount) as t
              from public.expenses
              where gym_id = p_gym_id and deleted_at is null and spent_on >= p_from_date and spent_on <= p_to_date
              group by 1) x), '[]'::json),
    'expenses_by_category', coalesce((
        select json_agg(json_build_object('key', k, 'total', t) order by t desc)
        from (select category as k, sum(amount) as t
              from public.expenses
              where gym_id = p_gym_id and deleted_at is null and spent_on >= p_from_date and spent_on <= p_to_date
              group by 1) x), '[]'::json)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.set_member_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n bigint;
begin
  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtextextended('member_code:' || new.gym_id::text, 0));
    select coalesce(max(substring(code from '^M([0-9]+)$')::bigint), 0) + 1
      into n from public.members where gym_id = new.gym_id;
    new.code := 'M' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.set_receipt_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pfx text; n bigint;
begin
  if new.receipt_no is null or btrim(new.receipt_no) = '' then
    pfx := 'R' || to_char(coalesce(new.paid_at, now()) at time zone 'Asia/Karachi', 'YYYYMMDD') || '-';
    perform pg_advisory_xact_lock(hashtextextended('receipt:' || new.gym_id::text || pfx, 0));
    select coalesce(max(substring(receipt_no from '-([0-9]+)$')::bigint), 0) + 1
      into n from public.payments
     where gym_id = new.gym_id and receipt_no like pfx || '%';
    new.receipt_no := pfx || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end; $function$
;

create trigger trg_gyms_protect_fields before update on public.gyms for each row execute function public.protect_gym_fields();
create trigger trg_gyms_updated_at before update on public.gyms for each row execute function public.set_updated_at();
create trigger trg_users_protect_privileges before insert or update on public.users for each row execute function public.protect_user_privileges();
create trigger trg_users_protect_critical before insert or update on public.users for each row execute function public.protect_user_critical_fields();
create trigger trg_users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger trg_settings_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger trg_attendance_protect_gym_id before update on public.attendance for each row execute function public.prevent_gym_id_change();
create trigger trg_attendance_updated_at before update on public.attendance for each row execute function public.set_updated_at();
create trigger trg_expenses_protect_gym_id before update on public.expenses for each row execute function public.prevent_gym_id_change();
create trigger trg_expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger trg_members_protect_gym_id before update on public.members for each row execute function public.prevent_gym_id_change();
create trigger trg_members_protect_soft_delete before update on public.members for each row execute function public.protect_member_soft_delete();
create trigger trg_members_set_code before insert on public.members for each row execute function public.set_member_code();
create trigger trg_members_updated_at before update on public.members for each row execute function public.set_updated_at();
create trigger trg_payments_protect_gym_id before update on public.payments for each row execute function public.prevent_gym_id_change();
create trigger trg_payments_set_receipt before insert on public.payments for each row execute function public.set_receipt_no();
create trigger trg_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger trg_plans_protect_gym_id before update on public.plans for each row execute function public.prevent_gym_id_change();
create trigger trg_plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.gyms enable row level security;
alter table public.users enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;
alter table public.gym_subscriptions enable row level security;
alter table public.audit_log enable row level security;
create policy "attendance_delete" on public.attendance for delete to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "attendance_insert" on public.attendance for insert to authenticated with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]));
create policy "attendance_select" on public.attendance for select to authenticated using (can_read_gym(gym_id));
create policy "attendance_update" on public.attendance for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]));
create policy "audit_insert" on public.audit_log for insert to authenticated with check ((is_super_admin() OR ((user_id = auth.uid()) AND (gym_id = get_user_gym_id()))));
create policy "audit_select" on public.audit_log for select to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role], false));
create policy "expenses_delete" on public.expenses for delete to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "expenses_insert" on public.expenses for insert to authenticated with check ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]) AND ((NOT (recorded_by IS DISTINCT FROM auth.uid())) OR is_super_admin())));
create policy "expenses_select" on public.expenses for select to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role], false));
create policy "expenses_update" on public.expenses for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "super admin manages gym_subscriptions" on public.gym_subscriptions for all to authenticated using ((EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = auth.uid()) AND (u.role = 'super_admin'::user_role))))) with check ((EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = auth.uid()) AND (u.role = 'super_admin'::user_role)))));
create policy "gyms_delete" on public.gyms for delete to authenticated using (is_super_admin());
create policy "gyms_insert" on public.gyms for insert to authenticated with check (is_super_admin());
create policy "gyms_select" on public.gyms for select to authenticated using (can_read_gym(id));
create policy "gyms_update" on public.gyms for update to authenticated using (has_gym_role(id, ARRAY['gym_owner'::user_role])) with check (has_gym_role(id, ARRAY['gym_owner'::user_role]));
create policy "members_insert" on public.members for insert to authenticated with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]));
create policy "members_select" on public.members for select to authenticated using (can_read_gym(gym_id));
create policy "members_update" on public.members for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]));
create policy "payments_delete" on public.payments for delete to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "payments_insert" on public.payments for insert to authenticated with check ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]) AND ((NOT (recorded_by IS DISTINCT FROM auth.uid())) OR is_super_admin())));
create policy "payments_select" on public.payments for select to authenticated using ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role], false) OR (has_gym_role(gym_id, ARRAY['receptionist'::user_role], false) AND (recorded_by = auth.uid()))));
create policy "payments_update" on public.payments for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "plans_delete" on public.plans for delete to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "plans_insert" on public.plans for insert to authenticated with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "plans_select" on public.plans for select to authenticated using (can_read_gym(gym_id));
create policy "plans_update" on public.plans for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role]));
create policy "settings_delete" on public.settings for delete to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role]));
create policy "settings_insert" on public.settings for insert to authenticated with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role]));
create policy "settings_select" on public.settings for select to authenticated using (can_read_gym(gym_id));
create policy "settings_update" on public.settings for update to authenticated using (has_gym_role(gym_id, ARRAY['gym_owner'::user_role])) with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role]));
create policy "users_delete" on public.users for delete to authenticated using ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role]) AND (id <> auth.uid())));
create policy "users_insert" on public.users for insert to authenticated with check (has_gym_role(gym_id, ARRAY['gym_owner'::user_role]));
create policy "users_select" on public.users for select to authenticated using (((id = auth.uid()) OR has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role], false)));
create policy "users_update" on public.users for update to authenticated using ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role]) OR ((id = auth.uid()) AND has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role])))) with check ((has_gym_role(gym_id, ARRAY['gym_owner'::user_role]) OR ((id = auth.uid()) AND has_gym_role(gym_id, ARRAY['gym_owner'::user_role, 'manager'::user_role, 'receptionist'::user_role]))));
