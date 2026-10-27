-- 002_rpc_hardening.sql  (Phase 1, items 3, 4 and the RPC half of 10)  -- re-runnable
-- v2: receptionists must pay the full plan price and cannot back/forward-date the join date;
--     amount cap is read from the real payments.amount column; unique phone index (guarded).
-- Live finding: create_member and renew_member were SECURITY INVOKER (prosecdef = false).
-- They are now SECURITY DEFINER with explicit checks, and are only callable by signed-in users.
begin;

-- A. Phone normalisation. The old regexp '[\\s-]' stripped backslash, 's' and '-', NOT spaces.
create or replace function public.normalize_phone(p_phone text)
returns text language sql immutable set search_path = public, pg_temp
as $$ select nullif(regexp_replace(btrim(coalesce(p_phone, '')), '[[:space:]-]', '', 'g'), '') $$;

-- Largest value payments.amount can hold (numeric(p,s) -> 10^(p-s) - 10^-s). Falls back to
-- 9999999999.99 when the column has no declared precision.
create or replace function public.max_payment_amount()
returns numeric language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select power(10::numeric, c.numeric_precision - c.numeric_scale) - power(10::numeric, -c.numeric_scale)
       from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'payments' and c.column_name = 'amount'
        and c.numeric_precision is not null),
    9999999999.99::numeric)
$$;

-- Old non-unique index (v1) is replaced by a UNIQUE one so direct edits, reactivation, desktop sync
-- and two simultaneous adds cannot create duplicate phones.
drop index if exists public.idx_members_gym_phone_norm;
do $$
declare v_dups bigint;
begin
  select count(*) into v_dups from (
    select 1 from public.members
     where is_active and deleted_at is null and phone is not null and public.normalize_phone(phone) is not null
     group by gym_id, public.normalize_phone(phone) having count(*) > 1) d;
  if v_dups > 0 then
    raise warning 'SKIPPED unique phone index: % duplicate phone group(s) already exist. Find them with: select gym_id, public.normalize_phone(phone) p, count(*) from public.members where is_active and deleted_at is null and phone is not null group by 1,2 having count(*) > 1;  Fix them, then re-run this file.', v_dups;
  else
    create unique index if not exists idx_members_gym_phone_uniq
      on public.members (gym_id, public.normalize_phone(phone))
      where is_active and deleted_at is null and phone is not null;
  end if;
end $$;

-- B. create_member
create or replace function public.create_member(
  p_name text, p_phone text, p_plan_id uuid, p_join_date date,
  p_amount numeric default 0, p_method public.payment_method default 'cash'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_gym   uuid := public.get_user_gym_id();
  v_role  public.user_role := public.get_user_role();
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_join  date := coalesce(p_join_date, v_today);
  v_amount numeric;
  v_exp   date;
  v_receipt text;
  pl  public.plans%rowtype;
  m   public.members%rowtype;
  pay public.payments%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if v_gym is null or v_role is null then
    raise exception 'No gym linked to this account' using errcode = '42501';
  end if;
  if v_role not in ('gym_owner', 'manager', 'receptionist', 'super_admin') then
    raise exception 'Your role cannot add members' using errcode = '42501';
  end if;
  if not public.is_super_admin() and not public.is_gym_active(v_gym) then
    raise exception 'This gym is not active. Please contact support.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Name required' using errcode = '22023';
  end if;
  if p_method is null then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;
  if p_amount is null then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount < 0 or v_amount > public.max_payment_amount() then   -- NaN and Infinity also fail here
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  -- Receptionists may only enter a join date from the last 7 days up to tomorrow.
  if v_role = 'receptionist' and (v_join < v_today - 7 or v_join > v_today + 1) then
    raise exception 'Receptionists can only use a join date from the last 7 days up to tomorrow'
      using errcode = '22023';
  end if;

  if v_phone is not null and exists (
       select 1 from public.members
        where gym_id = v_gym and is_active and deleted_at is null
          and public.normalize_phone(phone) = public.normalize_phone(v_phone)) then
    raise exception 'DUPLICATE_PHONE' using errcode = '23505';
  end if;

  if p_plan_id is not null then
    select * into pl from public.plans
     where id = p_plan_id and gym_id = v_gym and is_active;
    if not found then
      raise exception 'Plan not found or inactive' using errcode = 'P0002';
    end if;
    -- Receptionists cannot give discounts or free memberships; manager / owner may.
    if v_role = 'receptionist' and v_amount < pl.price then
      raise exception 'Receptionists must collect the full plan price (%)', pl.price
        using errcode = '22023';
    end if;
    v_exp := (v_join + make_interval(months => pl.duration_months))::date;
  end if;

  insert into public.members (gym_id, code, name, phone, plan_id, join_date, expiry_date)
  values (v_gym, '', btrim(p_name), v_phone, p_plan_id, v_join, v_exp)
  returning * into m;

  if v_amount > 0 then
    insert into public.payments (gym_id, member_id, plan_id, amount, payment_method, recorded_by)
    values (v_gym, m.id, p_plan_id, v_amount, p_method, v_uid)
    returning * into pay;
    v_receipt := pay.receipt_no;
  end if;

  return jsonb_build_object(
    'member_id', m.id, 'code', m.code,
    'receipt_no', v_receipt, 'expiry_date', v_exp);
end $fn$;

-- C. renew_member
create or replace function public.renew_member(
  p_member_id uuid, p_plan_id uuid, p_amount numeric,
  p_method public.payment_method default 'cash', p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_gym   uuid := public.get_user_gym_id();
  v_role  public.user_role := public.get_user_role();
  v_amount numeric;
  m       public.members%rowtype;
  pl      public.plans%rowtype;
  pay     public.payments%rowtype;
  today   date := (now() at time zone 'Asia/Karachi')::date;
  base    date;
  new_exp date;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if v_gym is null or v_role is null then
    raise exception 'No gym linked to this account' using errcode = '42501';
  end if;
  if v_role not in ('gym_owner', 'manager', 'receptionist', 'super_admin') then
    raise exception 'Your role cannot renew members' using errcode = '42501';
  end if;
  if not public.is_super_admin() and not public.is_gym_active(v_gym) then
    raise exception 'This gym is not active. Please contact support.' using errcode = '42501';
  end if;
  if p_method is null then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;
  if p_amount is null then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 or v_amount > public.max_payment_amount() then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;

  select * into m from public.members
   where id = p_member_id and gym_id = v_gym and deleted_at is null
   for update;
  if not found then
    raise exception 'Member not found or not allowed' using errcode = 'P0002';
  end if;

  select * into pl from public.plans
   where id = p_plan_id and gym_id = v_gym and is_active;
  if not found then
    raise exception 'Plan not found or inactive' using errcode = 'P0002';
  end if;

  if v_role = 'receptionist' and v_amount < pl.price then
    raise exception 'Receptionists must collect the full plan price (%)', pl.price
      using errcode = '22023';
  end if;

  base    := greatest(today, coalesce(m.expiry_date, today));
  new_exp := (base + make_interval(months => pl.duration_months))::date;

  update public.members
     set plan_id = pl.id, expiry_date = new_exp
   where id = m.id;

  insert into public.payments (gym_id, member_id, plan_id, amount, payment_method, note, recorded_by)
  values (m.gym_id, m.id, pl.id, v_amount, p_method, p_note, v_uid)
  returning * into pay;

  return jsonb_build_object(
    'payment_id', pay.id, 'receipt_no', pay.receipt_no, 'expiry_date', new_exp);
end $fn$;

-- D. Only signed-in users may call them (not anon, not PUBLIC).
revoke all on function public.create_member(text, text, uuid, date, numeric, public.payment_method) from public, anon;
grant execute on function public.create_member(text, text, uuid, date, numeric, public.payment_method) to authenticated;
revoke all on function public.renew_member(uuid, uuid, numeric, public.payment_method, text) from public, anon;
grant execute on function public.renew_member(uuid, uuid, numeric, public.payment_method, text) to authenticated;

-- E. Karachi dates for defaults (receipts already use Karachi in live set_receipt_no; left unchanged).
alter table public.members  alter column join_date set default ((now() at time zone 'Asia/Karachi')::date);
alter table public.expenses alter column spent_on  set default ((now() at time zone 'Asia/Karachi')::date);

commit;
