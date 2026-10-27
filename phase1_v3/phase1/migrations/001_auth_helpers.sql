-- 001_auth_helpers.sql  (Phase 1, item 2)  -- re-runnable
-- * is_gym_active() also checks expires_at
-- * get_user_role() / get_user_gym_id() return NULL for deactivated users
-- * every helper is SECURITY DEFINER with search_path pinned (pg_temp last)
-- * gym_subscriptions policy uses is_super_admin() so a deactivated super admin loses access
begin;

create or replace function public.is_gym_active(p_gym_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select g.status = 'active' and (g.expires_at is null or g.expires_at > now())
       from public.gyms g where g.id = p_gym_id),
    false)
$$;

create or replace function public.get_user_role()
returns public.user_role language sql stable security definer set search_path = public, pg_temp
as $$ select u.role from public.users u where u.id = auth.uid() and u.is_active is true $$;

create or replace function public.get_user_gym_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select u.gym_id from public.users u where u.id = auth.uid() and u.is_active is true $$;

-- Already definer in live; re-assert and harden search_path.
alter function public.is_super_admin() security definer set search_path = public, pg_temp;
alter function public.can_read_gym(uuid) security definer set search_path = public, pg_temp;
alter function public.has_gym_role(uuid, public.user_role[], boolean) security definer set search_path = public, pg_temp;

drop policy if exists "super admin manages gym_subscriptions" on public.gym_subscriptions;
create policy "super admin manages gym_subscriptions" on public.gym_subscriptions
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

commit;
