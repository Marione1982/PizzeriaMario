-- Forno di casa: schema del database Supabase "Pizzeria da Mario".
-- Rigenerato dal database reale (migrazioni fino al 2026-11-02) ed eseguibile
-- più volte senza errori. Ogni riga appartiene a un utente (user_id) ed è
-- protetta da RLS: un utente autenticato vede e modifica solo i propri dati.
--
-- Due punti sono allineati all'app e NON ancora presenti nel database live
-- (vanno applicati con una migrazione):
--   1. revoke ad anon anche sulle tabelle delle speciali;
--   2. realtime attivo anche sulle tabelle delle speciali.

-- Ricettario ---------------------------------------------------------------

create table if not exists public.ingredients (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  unit text not null default 'pz' check (unit in ('pz', 'g', 'ml', 'qb')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists ingredients_user_name_idx
  on public.ingredients(user_id, lower(name));

create table if not exists public.pizzas (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  type text not null check (type in ('bianca', 'rossa')),
  created_at timestamptz not null default now(),
  notes text not null default '',
  primary key (user_id, id)
);
create unique index if not exists pizzas_user_name_idx
  on public.pizzas(user_id, lower(name));

create table if not exists public.pizza_ingredients (
  user_id uuid not null references auth.users(id) on delete cascade,
  pizza_id text not null,
  ingredient_id text not null,
  quantity_per_pizza numeric(10,2) not null default 1 check (quantity_per_pizza > 0),
  primary key (user_id, pizza_id, ingredient_id),
  foreign key (user_id, pizza_id) references public.pizzas(user_id, id) on delete cascade,
  foreign key (user_id, ingredient_id) references public.ingredients(user_id, id) on delete cascade
);
create index if not exists pizza_ingredients_user_ingredient_idx
  on public.pizza_ingredients(user_id, ingredient_id);

-- Speciali (preparazioni fuori dalle pizze) ----------------------------------

create table if not exists public.specials (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  notes text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.special_ingredients (
  user_id uuid not null references auth.users(id) on delete cascade,
  special_id text not null,
  ingredient_id text not null,
  quantity_per_preparation numeric not null default 1 check (quantity_per_preparation > 0),
  primary key (user_id, special_id, ingredient_id),
  foreign key (user_id, special_id) references public.specials(user_id, id) on delete cascade,
  foreign key (user_id, ingredient_id) references public.ingredients(user_id, id) on delete cascade
);

-- Serate -------------------------------------------------------------------
-- Una persona può pianificare più serate; la chiave primaria è (user_id, id).

create table if not exists public.pizza_events (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date date,
  guest_count integer not null default 4 check (guest_count between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_ingredients text[] not null default array[]::text[],
  event_notes text not null default '',
  dough_weight_g numeric
    constraint pizza_events_dough_weight_nonnegative check (dough_weight_g is null or dough_weight_g >= 0),
  hydration_percent numeric
    constraint pizza_events_hydration_range check (hydration_percent is null or (hydration_percent >= 0 and hydration_percent <= 100)),
  ball_count integer
    constraint pizza_events_ball_count_nonnegative check (ball_count is null or ball_count >= 0),
  ball_weight_g numeric
    constraint pizza_events_ball_weight_nonnegative check (ball_weight_g is null or ball_weight_g >= 0),
  maturation_hours numeric
    constraint pizza_events_maturation_nonnegative check (maturation_hours is null or maturation_hours >= 0),
  primary key (user_id, id)
);

create table if not exists public.event_pizzas (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  pizza_id text not null,
  quantity integer not null default 0 check (quantity between 0 and 99),
  primary key (user_id, event_id, pizza_id),
  foreign key (user_id, event_id) references public.pizza_events(user_id, id) on delete cascade,
  foreign key (user_id, pizza_id) references public.pizzas(user_id, id) on delete cascade
);
create index if not exists event_pizzas_user_pizza_idx
  on public.event_pizzas(user_id, pizza_id);

create table if not exists public.event_specials (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  special_id text not null,
  quantity integer not null default 0 check (quantity between 0 and 99),
  primary key (user_id, event_id, special_id),
  foreign key (user_id, event_id) references public.pizza_events(user_id, id) on delete cascade,
  foreign key (user_id, special_id) references public.specials(user_id, id) on delete cascade
);

-- Sicurezza (RLS e permessi) -------------------------------------------------

alter table public.ingredients enable row level security;
alter table public.pizzas enable row level security;
alter table public.pizza_ingredients enable row level security;
alter table public.specials enable row level security;
alter table public.special_ingredients enable row level security;
alter table public.pizza_events enable row level security;
alter table public.event_pizzas enable row level security;
alter table public.event_specials enable row level security;

revoke all on public.ingredients, public.pizzas, public.pizza_ingredients,
  public.specials, public.special_ingredients,
  public.pizza_events, public.event_pizzas, public.event_specials from anon;

drop policy if exists "Users manage their ingredients" on public.ingredients;
create policy "Users manage their ingredients" on public.ingredients
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their pizzas" on public.pizzas;
create policy "Users manage their pizzas" on public.pizzas
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their pizza ingredients" on public.pizza_ingredients;
create policy "Users manage their pizza ingredients" on public.pizza_ingredients
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their specials" on public.specials;
create policy "Users manage their specials" on public.specials
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their special ingredients" on public.special_ingredients;
create policy "Users manage their special ingredients" on public.special_ingredients
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their events" on public.pizza_events;
create policy "Users manage their events" on public.pizza_events
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their event pizzas" on public.event_pizzas;
create policy "Users manage their event pizzas" on public.event_pizzas
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their event specials" on public.event_specials;
create policy "Users manage their event specials" on public.event_specials
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.pizzas to authenticated;
grant select, insert, update, delete on public.pizza_ingredients to authenticated;
grant select, insert, update, delete on public.specials to authenticated;
grant select, insert, update, delete on public.special_ingredients to authenticated;
grant select, insert, update, delete on public.pizza_events to authenticated;
grant select, insert, update, delete on public.event_pizzas to authenticated;
grant select, insert, update, delete on public.event_specials to authenticated;

-- Realtime ---------------------------------------------------------------------
-- L'app si iscrive ai cambiamenti di tutte e 8 le tabelle (vedi app.js,
-- subscribeToUserData). Aggiunge solo quelle non ancora pubblicate.

do $$
declare
  t text;
begin
  foreach t in array array[
    'ingredients', 'pizzas', 'pizza_ingredients',
    'specials', 'special_ingredients',
    'pizza_events', 'event_pizzas', 'event_specials'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
