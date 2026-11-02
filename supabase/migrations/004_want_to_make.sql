begin;
-- Coffees the club wants to make stay off the Coffees page until someone marks them as made.
-- Every coffee saved before this update has been made, so they all start as made.
alter table public.coffees add column if not exists made boolean not null default true;
notify pgrst, 'reload schema';
commit;
