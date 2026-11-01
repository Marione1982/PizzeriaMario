-- Schema iniziale per un progetto Supabase dedicato a Forno di casa.
-- Le tabelle sono protette da RLS e i dati appartengono all'utente autenticato.

create table if not exists public.ingredients (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  unit text not null default 'pz' check (unit in ('pz', 'g', 'ml', 'qb')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists ingredients_user_name_idx on public.ingredients(user_id, lower(name));

create table if not exists public.pizzas (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  type text not null check (type in ('bianca', 'rossa')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists pizzas_user_name_idx on public.pizzas(user_id, lower(name));

create table if not exists public.pizza_ingredients (
  user_id uuid not null references auth.users(id) on delete cascade,
  pizza_id text not null,
  ingredient_id text not null,
  quantity_per_pizza numeric(10,2) not null default 1 check (quantity_per_pizza > 0),
  primary key (user_id, pizza_id, ingredient_id),
  foreign key (user_id, pizza_id) references public.pizzas(user_id, id) on delete cascade,
  foreign key (user_id, ingredient_id) references public.ingredients(user_id, id) on delete cascade
);
create index if not exists pizza_ingredients_user_ingredient_idx on public.pizza_ingredients(user_id, ingredient_id);

create table if not exists public.pizza_events (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date date,
  guest_count integer not null default 4 check (guest_count between 1 and 99),
  checked_ingredients text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id)
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
create index if not exists event_pizzas_user_pizza_idx on public.event_pizzas(user_id, pizza_id);

alter table public.ingredients enable row level security;
alter table public.pizzas enable row level security;
alter table public.pizza_ingredients enable row level security;
alter table public.pizza_events enable row level security;
alter table public.event_pizzas enable row level security;

alter publication supabase_realtime add table
  public.ingredients, public.pizzas, public.pizza_ingredients,
  public.pizza_events, public.event_pizzas;

revoke all on public.ingredients, public.pizzas, public.pizza_ingredients,
  public.pizza_events, public.event_pizzas from anon;

create policy "Users manage their ingredients" on public.ingredients
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their pizzas" on public.pizzas
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their pizza ingredients" on public.pizza_ingredients
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their events" on public.pizza_events
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their event pizzas" on public.event_pizzas
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.pizzas to authenticated;
grant select, insert, update, delete on public.pizza_ingredients to authenticated;
grant select, insert, update, delete on public.pizza_events to authenticated;
grant select, insert, update, delete on public.event_pizzas to authenticated;
