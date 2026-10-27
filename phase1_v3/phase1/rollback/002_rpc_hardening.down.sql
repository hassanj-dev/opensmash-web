-- Rollback of 002: restores the live create_member / renew_member (SECURITY INVOKER) as found.
begin;

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
end $function$;

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
end $function$;

-- Restore default execute rights (PUBLIC), as before.
grant execute on function public.create_member(text, text, uuid, date, numeric, public.payment_method) to public, anon, authenticated;
grant execute on function public.renew_member(uuid, uuid, numeric, public.payment_method, text) to public, anon, authenticated;

alter table public.members  alter column join_date set default current_date;
alter table public.expenses alter column spent_on  set default current_date;

drop index if exists public.idx_members_gym_phone_norm;
drop index if exists public.idx_members_gym_phone_uniq;
drop function if exists public.max_payment_amount();
drop function if exists public.normalize_phone(text);

commit;
