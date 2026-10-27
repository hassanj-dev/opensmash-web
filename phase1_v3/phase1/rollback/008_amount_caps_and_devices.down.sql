-- Rollback of 008. WARNING: dropping devices deletes every registered device row.
begin;
drop table if exists public.devices cascade;
drop function if exists public.devices_before_update();
alter table public.payments           drop constraint if exists payments_amount_range;
alter table public.expenses           drop constraint if exists expenses_amount_range;
alter table public.plans              drop constraint if exists plans_price_range;
alter table public.gym_subscriptions  drop constraint if exists gym_subscriptions_amount_range;
commit;
