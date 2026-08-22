-- Globally curated recipes are deliberately separate from household recipes.
-- A household receives its own editable snapshot only through
-- adopt_curated_recipe(), so personal edits never mutate the shared library.

create type public.curated_tag_category as enum (
  'course', 'cuisine', 'protein', 'method', 'dietary'
);

create table public.curated_recipe_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  source_name text not null,
  source_url text not null,
  license_name text not null,
  license_url text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curated_recipe_collections_values_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and length(slug) <= 100
    and btrim(name) <> '' and length(name) <= 500
    and (description is null or length(description) <= 10000)
    and btrim(source_name) <> '' and length(source_name) <= 500
    and length(source_url) <= 2048
    and source_url = public.sanitize_recipe_source_url(source_url)
    and btrim(license_name) <> '' and length(license_name) <= 500
    and length(license_url) <= 2048
    and license_url = public.sanitize_recipe_source_url(license_url)
  )
);

create table public.curated_recipes (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.curated_recipe_collections(id) on delete restrict,
  slug text not null,
  title text not null,
  description text,
  source_url text not null,
  servings numeric,
  instructions text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, slug),
  constraint curated_recipes_values_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and length(slug) <= 150
    and btrim(title) <> '' and length(title) <= 500
    and (description is null or length(description) <= 10000)
    and length(source_url) <= 2048
    and source_url = public.sanitize_recipe_source_url(source_url)
    and (servings is null or (servings > 0 and servings <= 10000 and servings <> 'NaN'::numeric))
    and length(instructions) <= 100000
  )
);

create table public.curated_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  curated_recipe_id uuid not null references public.curated_recipes(id) on delete cascade,
  item_name text not null,
  quantity numeric,
  unit text,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (curated_recipe_id, display_order),
  constraint curated_recipe_ingredients_values_check check (
    btrim(item_name) <> '' and length(item_name) <= 500
    and (quantity is null or (quantity > 0 and quantity <> 'NaN'::numeric))
    and (unit is null or (btrim(unit) <> '' and length(unit) <= 100))
    and (notes is null or length(notes) <= 2000)
    and display_order >= 0
  )
);

create table public.curated_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category public.curated_tag_category not null,
  created_at timestamptz not null default now(),
  constraint curated_tags_values_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and length(slug) <= 100
    and btrim(label) <> '' and length(label) <= 100
  )
);

create table public.curated_recipe_tags (
  curated_recipe_id uuid not null references public.curated_recipes(id) on delete cascade,
  curated_tag_id uuid not null references public.curated_tags(id) on delete restrict,
  primary key (curated_recipe_id, curated_tag_id)
);

-- One adoption produces exactly one independently editable household recipe.
-- Removing that recipe removes the adoption marker and permits a later re-add.
create table public.curated_recipe_adoptions (
  household_id uuid not null references public.households(id) on delete cascade,
  curated_recipe_id uuid not null references public.curated_recipes(id) on delete restrict,
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  adopted_at timestamptz not null default now(),
  primary key (household_id, curated_recipe_id)
);

create index idx_curated_recipes_collection_published on public.curated_recipes(collection_id, published);
create index idx_curated_recipe_ingredients_recipe_order on public.curated_recipe_ingredients(curated_recipe_id, display_order);
create index idx_curated_recipe_tags_tag_recipe on public.curated_recipe_tags(curated_tag_id, curated_recipe_id);
create index idx_curated_recipe_adoptions_household on public.curated_recipe_adoptions(household_id);

alter table public.curated_recipe_collections enable row level security;
alter table public.curated_recipes enable row level security;
alter table public.curated_recipe_ingredients enable row level security;
alter table public.curated_tags enable row level security;
alter table public.curated_recipe_tags enable row level security;
alter table public.curated_recipe_adoptions enable row level security;

-- Only published catalogue records are visible to signed-in users.  There are
-- intentionally no write policies: curation is a migration/admin operation.
create policy "curated_collections_published_select" on public.curated_recipe_collections for select
  to authenticated using (published);
create policy "curated_recipes_published_select" on public.curated_recipes for select
  to authenticated using (published and exists (
    select 1 from public.curated_recipe_collections c
    where c.id = collection_id and c.published
  ));
create policy "curated_recipe_ingredients_published_select" on public.curated_recipe_ingredients for select
  to authenticated using (exists (
    select 1 from public.curated_recipes r
    join public.curated_recipe_collections c on c.id = r.collection_id
    where r.id = curated_recipe_id and r.published and c.published
  ));
create policy "curated_tags_select" on public.curated_tags for select
  to authenticated using (true);
create policy "curated_recipe_tags_published_select" on public.curated_recipe_tags for select
  to authenticated using (exists (
    select 1 from public.curated_recipes r
    join public.curated_recipe_collections c on c.id = r.collection_id
    where r.id = curated_recipe_id and r.published and c.published
  ));
create policy "curated_recipe_adoptions_member_select" on public.curated_recipe_adoptions for select
  to authenticated using ((select public.is_household_member(household_id)));

create or replace function public.adopt_curated_recipe(
  p_household_id uuid,
  p_curated_recipe_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_curated_recipe public.curated_recipes%rowtype;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;

  -- Serialise only this household/catalogue pair.  This preserves the unique
  -- adoption invariant without creating an orphan recipe during concurrent UI submits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_household_id::text || ':' || p_curated_recipe_id::text, 0)
  );

  select a.recipe_id into v_recipe_id
  from public.curated_recipe_adoptions a
  where a.household_id = p_household_id
    and a.curated_recipe_id = p_curated_recipe_id;
  if found then
    return v_recipe_id;
  end if;

  select r.* into v_curated_recipe
  from public.curated_recipes r
  join public.curated_recipe_collections c on c.id = r.collection_id
  where r.id = p_curated_recipe_id
    and r.published
    and c.published
  for key share of r, c;
  if not found then
    raise exception using errcode = 'P0002', message = 'published curated recipe not found';
  end if;

  if not exists (
    select 1 from public.curated_recipe_ingredients i
    where i.curated_recipe_id = v_curated_recipe.id
  ) then
    raise exception using errcode = '23514', message = 'curated recipe has no ingredients';
  end if;

  insert into public.recipes (
    household_id, title, description, source_url, favorite, servings,
    instructions, ingestion_status
  ) values (
    p_household_id, v_curated_recipe.title, v_curated_recipe.description,
    v_curated_recipe.source_url, false, v_curated_recipe.servings,
    v_curated_recipe.instructions, 'parsed'
  ) returning id into v_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, item_name, quantity, unit, notes, display_order
  )
  select
    v_recipe_id, i.item_name, i.quantity, i.unit, i.notes, i.display_order
  from public.curated_recipe_ingredients i
  where i.curated_recipe_id = v_curated_recipe.id
  order by i.display_order;

  insert into public.curated_recipe_adoptions (
    household_id, curated_recipe_id, recipe_id
  ) values (
    p_household_id, v_curated_recipe.id, v_recipe_id
  );

  return v_recipe_id;
end;
$$;

revoke all on table public.curated_recipe_collections, public.curated_recipes,
  public.curated_recipe_ingredients, public.curated_tags, public.curated_recipe_tags,
  public.curated_recipe_adoptions from public, anon, authenticated;
grant select on table public.curated_recipe_collections, public.curated_recipes,
  public.curated_recipe_ingredients, public.curated_tags, public.curated_recipe_tags,
  public.curated_recipe_adoptions to authenticated;

revoke all on function public.adopt_curated_recipe(uuid, uuid) from public, anon;
grant execute on function public.adopt_curated_recipe(uuid, uuid) to authenticated;

-- Fail closed if a future default privilege or role membership reopens direct writes.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.curated_recipe_collections', 'public.curated_recipes',
    'public.curated_recipe_ingredients', 'public.curated_tags',
    'public.curated_recipe_tags', 'public.curated_recipe_adoptions'
  ] loop
    if has_table_privilege('anon', v_table, 'SELECT')
      or has_table_privilege('anon', v_table, 'INSERT')
      or has_table_privilege('anon', v_table, 'UPDATE')
      or has_table_privilege('anon', v_table, 'DELETE') then
      raise exception 'anonymous privilege remains on %', v_table;
    end if;
    if has_table_privilege('authenticated', v_table, 'INSERT')
      or has_table_privilege('authenticated', v_table, 'UPDATE')
      or has_table_privilege('authenticated', v_table, 'DELETE') then
      raise exception 'authenticated write privilege remains on %', v_table;
    end if;
  end loop;

  if not has_function_privilege('authenticated', 'public.adopt_curated_recipe(uuid,uuid)'::regprocedure, 'EXECUTE')
    or has_function_privilege('anon', 'public.adopt_curated_recipe(uuid,uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'curated recipe adoption RPC privileges are invalid';
  end if;
end;
$$;

comment on function public.adopt_curated_recipe(uuid, uuid) is
  'Copies one published curated recipe into an authorized household exactly once; the copy is independently editable.';
