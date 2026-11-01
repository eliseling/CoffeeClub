begin;

do $$
begin
  if not exists (select 1 from public.coffee_club_migrations where id = 'ratings-ten-point') then
    alter table public.ratings drop constraint ratings_overall_check;
    alter table public.ratings drop constraint ratings_aroma_check;
    alter table public.ratings drop constraint ratings_flavor_check;
    alter table public.ratings rename column flavor to taste;
    alter table public.ratings drop column body;
    alter table public.ratings add column would_drink_again integer not null default 5;

    update public.ratings set overall = overall * 2, aroma = aroma * 2, taste = taste * 2;

    alter table public.ratings add constraint ratings_overall_check check (overall between 1 and 10);
    alter table public.ratings add constraint ratings_aroma_check check (aroma between 1 and 10);
    alter table public.ratings add constraint ratings_taste_check check (taste between 1 and 10);
    alter table public.ratings add constraint ratings_would_drink_again_check check (would_drink_again between 1 and 10);
    alter table public.ratings alter column overall set default 5;
    alter table public.ratings alter column taste set default 5;
    alter table public.ratings alter column aroma set default 5;

    insert into public.coffee_club_migrations (id) values ('ratings-ten-point');
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;