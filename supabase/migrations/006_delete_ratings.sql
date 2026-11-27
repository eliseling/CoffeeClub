begin;

-- Ratings can be moved to Recently deleted like coffees and recipes.
alter table public.ratings add column if not exists deleted_at timestamptz;

-- The hourly erase job now also erases ratings deleted more than 30 days ago.
create or replace function public.coffee_club_erase_expired()
returns void language sql set search_path = '' as $$
  delete from public.coffees where deleted_at < now() - interval '30 days';
  delete from public.recipes where deleted_at < now() - interval '30 days';
  delete from public.ratings where deleted_at < now() - interval '30 days';
$$;
revoke execute on function public.coffee_club_erase_expired() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
