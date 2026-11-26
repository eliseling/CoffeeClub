begin;

-- Coffees and recipes stay in Recently deleted for 30 days and are then erased for good.
-- Erasing a coffee also erases its ratings (on delete cascade).
create or replace function public.coffee_club_erase_expired()
returns void language sql set search_path = '' as $$
  delete from public.coffees where deleted_at < now() - interval '30 days';
  delete from public.recipes where deleted_at < now() - interval '30 days';
$$;
-- Only the scheduled job runs this; visitors to the website cannot call it.
revoke execute on function public.coffee_club_erase_expired() from public, anon, authenticated;
select public.coffee_club_erase_expired();

-- Check for expired entries every hour with pg_cron, which Supabase includes.
-- Running this file again replaces the job instead of adding a second one.
create extension if not exists pg_cron;
select cron.schedule('coffee-club-erase-expired', '0 * * * *', 'select public.coffee_club_erase_expired()');

commit;

-- Shows the scheduled job, to confirm the update worked.
select jobname, schedule, command, active from cron.job where jobname = 'coffee-club-erase-expired';
