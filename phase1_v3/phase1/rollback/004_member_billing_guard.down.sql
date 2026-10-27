begin;
drop trigger if exists trg_members_billing_guard on public.members;
drop function if exists public.protect_member_billing_fields();
commit;
