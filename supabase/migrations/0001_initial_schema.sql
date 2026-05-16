create extension if not exists "pgcrypto";

create type household_role as enum ('owner', 'member');
create type meal_plan_status as enum ('planned', 'completed', 'skipped');
create type shopping_list_status as enum ('draft', 'active', 'archived');
create type shopping_item_status as enum ('needed', 'checked', 'dismissed');
create type ingestion_status as enum ('manual', 'parsed', 'needs_review', 'failed');
create type deduction_status as enum ('applied', 'reversed', 'review_required');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role household_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  source_url text,
  favorite boolean not null default false,
  servings numeric,
  instructions text not null default '',
  ingestion_status ingestion_status not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_name text not null,
  quantity numeric,
  unit text,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_slot_id uuid not null references public.meal_slots(id),
  recipe_id uuid not null references public.recipes(id),
  planned_for date not null,
  status meal_plan_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, meal_slot_id, planned_for)
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_name text not null,
  quantity numeric not null default 0,
  unit text not null,
  category text,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pantry_deductions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_entry_id uuid not null references public.meal_plan_entries(id) on delete cascade,
  pantry_item_id uuid references public.pantry_items(id) on delete set null,
  recipe_ingredient_id uuid not null references public.recipe_ingredients(id),
  item_name text not null,
  quantity numeric not null,
  unit text not null,
  status deduction_status not null default 'applied',
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (meal_plan_entry_id, recipe_ingredient_id)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status shopping_list_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  item_name text not null,
  required_quantity numeric,
  pantry_quantity numeric,
  delta_quantity numeric,
  unit text,
  status shopping_item_status not null default 'needed',
  review_required boolean not null default false,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_household_memberships_user_id on public.household_memberships(user_id);
create index idx_meal_slots_household_id on public.meal_slots(household_id);
create index idx_recipes_household_id on public.recipes(household_id);
create index idx_recipe_ingredients_recipe_id on public.recipe_ingredients(recipe_id);
create index idx_meal_plan_entries_household_date on public.meal_plan_entries(household_id, planned_for);
create index idx_meal_plan_entries_recipe_id on public.meal_plan_entries(recipe_id);
create index idx_pantry_items_household_id on public.pantry_items(household_id);
create index idx_pantry_deductions_household_id on public.pantry_deductions(household_id);
create index idx_shopping_lists_household_id on public.shopping_lists(household_id);
create index idx_shopping_list_items_shopping_list_id on public.shopping_list_items(shopping_list_id);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_memberships hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.validate_meal_plan_entry_household()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.meal_slots ms
    where ms.id = new.meal_slot_id
      and ms.household_id = new.household_id
  ) then
    raise exception 'meal slot must belong to meal plan household';
  end if;

  if not exists (
    select 1
    from public.recipes r
    where r.id = new.recipe_id
      and r.household_id = new.household_id
  ) then
    raise exception 'recipe must belong to meal plan household';
  end if;

  return new;
end;
$$;

create trigger validate_meal_plan_entry_household
before insert or update on public.meal_plan_entries
for each row execute function public.validate_meal_plan_entry_household();

create or replace function public.validate_pantry_deduction_household()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.meal_plan_entries mpe
    where mpe.id = new.meal_plan_entry_id
      and mpe.household_id = new.household_id
  ) then
    raise exception 'meal plan entry must belong to deduction household';
  end if;

  if new.pantry_item_id is not null and not exists (
    select 1
    from public.pantry_items pi
    where pi.id = new.pantry_item_id
      and pi.household_id = new.household_id
  ) then
    raise exception 'pantry item must belong to deduction household';
  end if;

  if not exists (
    select 1
    from public.recipe_ingredients ri
    join public.recipes r on r.id = ri.recipe_id
    join public.meal_plan_entries mpe on mpe.id = new.meal_plan_entry_id
    where ri.id = new.recipe_ingredient_id
      and r.household_id = new.household_id
      and mpe.recipe_id = r.id
  ) then
    raise exception 'recipe ingredient must belong to deduction meal recipe and household';
  end if;

  return new;
end;
$$;

create trigger validate_pantry_deduction_household
before insert or update on public.pantry_deductions
for each row execute function public.validate_pantry_deduction_household();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  dinner_slot_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.households (name)
  values ('My Household')
  returning id into new_household_id;

  insert into public.household_memberships (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  insert into public.meal_slots (household_id, name, sort_order, is_default)
  values (new_household_id, 'Dinner', 10, true)
  returning id into dinner_slot_id;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.meal_slots enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.pantry_items enable row level security;
alter table public.pantry_deductions enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_providers enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "households_member_select" on public.households for select using (public.is_household_member(id));
create policy "households_member_update" on public.households for update using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "memberships_member_select" on public.household_memberships for select using (public.is_household_member(household_id));

create policy "meal_slots_member_all" on public.meal_slots for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "recipes_member_all" on public.recipes for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "recipe_ingredients_member_all" on public.recipe_ingredients for all
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_household_member(r.household_id)
  )
)
with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_household_member(r.household_id)
  )
);

create policy "meal_plan_entries_member_all" on public.meal_plan_entries for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "pantry_items_member_all" on public.pantry_items for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "pantry_deductions_member_all" on public.pantry_deductions for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "shopping_lists_member_all" on public.shopping_lists for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "shopping_list_items_member_all" on public.shopping_list_items for all
using (
  exists (
    select 1 from public.shopping_lists sl
    where sl.id = shopping_list_id and public.is_household_member(sl.household_id)
  )
)
with check (
  exists (
    select 1 from public.shopping_lists sl
    where sl.id = shopping_list_id and public.is_household_member(sl.household_id)
  )
);

create policy "shopping_providers_read" on public.shopping_providers for select using (true);
