begin;

alter table public.coffees add column if not exists deleted_at timestamptz;
alter table public.recipes add column if not exists deleted_at timestamptz;

-- Visitors can move entries to Recently deleted and restore them, but can no longer erase anything.
revoke delete, truncate on public.coffees, public.recipes, public.ratings from anon, authenticated;

notify pgrst, 'reload schema';
commit;
