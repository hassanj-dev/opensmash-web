-- Rollback of 001: restores the live definitions exactly as they were before Phase 1.
begin;

create or replace function public.is_gym_active(p_gym_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$ select coalesce((select status = 'active' from public.gyms where id = p_gym_id), false) $function$;

create or replace function public.get_user_role()
returns public.user_role language sql stable security definer set search_path to 'public'
as $function$ select role from public.users where id = auth.uid() $function$;

create or replace function public.get_user_gym_id()
returns uuid language sql stable security definer set search_path to 'public'
as $function$ select gym_id from public.users where id = auth.uid() $function$;

alter function public.is_super_admin() set search_path = public;
alter function public.can_read_gym(uuid) set search_path = public;
alter function public.has_gym_role(uuid, public.user_role[], boolean) set search_path = public;

drop policy if exists "super admin manages gym_subscriptions" on public.gym_subscriptions;
create policy "super admin manages gym_subscriptions" on public.gym_subscriptions
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'super_admin'::public.user_role))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'super_admin'::public.user_role));

commit;
