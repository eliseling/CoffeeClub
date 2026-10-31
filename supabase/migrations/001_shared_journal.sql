begin;

create table if not exists public.coffees (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) between 1 and 100),
  method text not null default 'Not recorded' check (method in ('Not recorded', 'Pour over', 'Espresso', 'French press', 'AeroPress', 'Cold brew', 'Moka pot')),
  roast text not null default 'Not recorded' check (roast in ('Not recorded', 'Light', 'Medium', 'Dark')),
  roaster text not null default '' check (length(roaster) <= 100),
  origin text not null default '' check (length(origin) <= 100),
  date date,
  tags text not null default '' check (length(tags) <= 200),
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) between 1 and 100),
  method text not null default 'Not recorded' check (method in ('Not recorded', 'Pour over', 'Espresso', 'French press', 'AeroPress', 'Cold brew', 'Moka pot')),
  author text not null default '' check (length(author) <= 80),
  ingredients text not null check (length(btrim(ingredients)) between 1 and 2000),
  steps text not null check (length(btrim(steps)) between 1 and 2000),
  time text not null default '' check (length(time) <= 40),
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id text primary key default gen_random_uuid()::text,
  coffee_id text not null references public.coffees(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  member text generated always as (lower(btrim(name))) stored,
  overall integer not null check (overall between 1 and 5),
  aroma integer not null check (aroma between 1 and 5),
  flavor integer not null check (flavor between 1 and 5),
  body integer not null check (body between 1 and 5),
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  unique (coffee_id, member)
);

create table if not exists public.coffee_club_migrations (id text primary key);
alter table public.coffee_club_migrations enable row level security;

create or replace function public.coffee_club_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coffee_club_updated_at on public.coffees;
create trigger coffee_club_updated_at before update on public.coffees for each row execute function public.coffee_club_touch_updated_at();
drop trigger if exists coffee_club_updated_at on public.recipes;
create trigger coffee_club_updated_at before update on public.recipes for each row execute function public.coffee_club_touch_updated_at();
drop trigger if exists coffee_club_updated_at on public.ratings;
create trigger coffee_club_updated_at before update on public.ratings for each row execute function public.coffee_club_touch_updated_at();

alter table public.coffees enable row level security;
alter table public.recipes enable row level security;
alter table public.ratings enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.coffees, public.recipes, public.ratings to anon, authenticated;

drop policy if exists coffee_club_shared_access on public.coffees;
create policy coffee_club_shared_access on public.coffees for all to anon, authenticated using (true) with check (true);
drop policy if exists coffee_club_shared_access on public.recipes;
create policy coffee_club_shared_access on public.recipes for all to anon, authenticated using (true) with check (true);
drop policy if exists coffee_club_shared_access on public.ratings;
create policy coffee_club_shared_access on public.ratings for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from public.coffee_club_migrations where id = 'club-first-tastings') then
    insert into public.coffees (id, name)
    select starter.id, starter.name from (values
      ('club-korean-coffee', 'Korean coffee'),
      ('club-brazilian-coffee', 'Brazilian coffee'),
      ('club-iced-biscoff-coffee', 'Iced Biscoff spread coffee')
    ) as starter(id, name)
    where not exists (select 1 from public.coffees existing where lower(existing.name) = lower(starter.name))
    on conflict (id) do nothing;
    insert into public.coffee_club_migrations (id) values ('club-first-tastings');
  end if;
end;
$$;

commit;