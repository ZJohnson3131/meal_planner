-- Converge the public Data API to narrow, transactional mutation boundaries.
-- This migration intentionally favours integrity over permissive legacy writes:
-- lifecycle, inventory, ownership, and ledger changes are RPC-only.

-- ---------------------------------------------------------------------------
-- Canonical unit and membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.canonical_cooking_unit(p_unit text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case lower(btrim(p_unit))
    when 'g' then 'g'
    when 'gram' then 'g'
    when 'grams' then 'g'
    when 'kg' then 'kg'
    when 'kilogram' then 'kg'
    when 'kilograms' then 'kg'
    when 'ml' then 'ml'
    when 'millilitre' then 'ml'
    when 'millilitres' then 'ml'
    when 'milliliter' then 'ml'
    when 'milliliters' then 'ml'
    when 'l' then 'l'
    when 'litre' then 'l'
    when 'litres' then 'l'
    when 'liter' then 'l'
    when 'liters' then 'l'
    when 'tsp' then 'tsp'
    when 'teaspoon' then 'tsp'
    when 'teaspoons' then 'tsp'
    when 'tbsp' then 'tbsp'
    when 'tablespoon' then 'tbsp'
    when 'tablespoons' then 'tbsp'
    when 'cup' then 'cup'
    when 'cups' then 'cup'
    when 'each' then 'each'
    when 'piece' then 'piece'
    when 'pieces' then 'piece'
    when 'pinch' then 'pinch'
    when 'pinches' then 'pinch'
    when 'packet' then 'packet'
    when 'packets' then 'packet'
    when 'pkt' then 'packet'
    when 'pkts' then 'packet'
    when 'can' then 'can'
    when 'cans' then 'can'
    when 'slice' then 'slice'
    when 'slices' then 'slice'
    when 'clove' then 'clove'
    when 'cloves' then 'clove'
    when 'bunch' then 'bunch'
    when 'bunches' then 'bunch'
    else null
  end;
$$;

create or replace function public.cooking_unit_base_factor(p_unit text)
returns numeric
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case public.canonical_cooking_unit(p_unit)
    when 'g' then 1
    when 'kg' then 1000
    when 'ml' then 1
    when 'l' then 1000
    when 'tsp' then 5
    when 'tbsp' then 15
    when 'cup' then 250
    when 'each' then 1
    when 'piece' then 1
    when 'pinch' then 1
    when 'packet' then 1
    when 'can' then 1
    when 'slice' then 1
    when 'clove' then 1
    when 'bunch' then 1
    else null
  end;
$$;

create or replace function public.cooking_units_are_compatible(p_from text, p_to text)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case
    when public.canonical_cooking_unit(p_from) in ('g', 'kg')
      then public.canonical_cooking_unit(p_to) in ('g', 'kg')
    when public.canonical_cooking_unit(p_from) in ('ml', 'l', 'tsp', 'tbsp', 'cup')
      then public.canonical_cooking_unit(p_to) in ('ml', 'l', 'tsp', 'tbsp', 'cup')
    else public.canonical_cooking_unit(p_from) = public.canonical_cooking_unit(p_to)
  end;
$$;

create or replace function public.decode_recipe_query_component(p_component text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_input text := replace(p_component, '+', ' ');
  v_output bytea := ''::bytea;
  v_index integer := 1;
  v_character text;
  v_hex text;
begin
  while v_index <= length(v_input) loop
    v_character := substr(v_input, v_index, 1);
    if v_character = '%' then
      if v_index + 2 > length(v_input) then
        return null;
      end if;
      v_hex := substr(v_input, v_index + 1, 2);
      if v_hex !~ '^[0-9A-Fa-f]{2}$' then
        return null;
      end if;
      v_output := v_output || decode(v_hex, 'hex');
      v_index := v_index + 3;
      continue;
    end if;
    v_output := v_output || convert_to(v_character, 'UTF8');
    v_index := v_index + 1;
  end loop;
  return convert_from(v_output, 'UTF8');
exception when others then
  -- Invalid UTF-8, embedded NUL, or any failed decoding is suspicious. The
  -- sanitizer treats null as a directive to drop the whole query parameter.
  return null;
end;
$$;

create or replace function public.is_sensitive_recipe_query_key(p_key text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_key text := public.decode_recipe_query_component(p_key);
  v_separated text;
  v_component text;
begin
  if v_key is null or v_key ~ '[[:cntrl:]]' then
    return true;
  end if;
  if lower(v_key) ~ '^(x-amz-|x-goog-)' then
    return true;
  end if;
  v_separated := regexp_replace(v_key, '([a-z0-9])([A-Z])', E'\\1_\\2', 'g');
  foreach v_component in array regexp_split_to_array(v_separated, '[^a-zA-Z0-9]+') loop
    if lower(v_component) = any (array[
      'access', 'auth', 'authorization', 'code', 'credential', 'email', 'jwt',
      'key', 'password', 'refresh', 'secret', 'session', 'sig', 'signature',
      'signed', 'token', 'user', 'username'
    ]) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.is_valid_recipe_url_authority(p_authority text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_match text[];
  v_host text;
  v_port text;
begin
  if p_authority = ''
    or length(p_authority) > 253
    or position('@' in p_authority) > 0
    or position(E'\\' in p_authority) > 0
    or p_authority ~ '[[:space:]]' then
    return false;
  end if;

  if left(p_authority, 1) = '[' then
    v_match := regexp_match(p_authority, '^\[([0-9A-Fa-f:.]+)\](?::([0-9]+))?$');
    if v_match is null then
      return false;
    end if;
    begin
      if family(v_match[1]::inet) <> 6 then
        return false;
      end if;
    exception when invalid_text_representation then
      return false;
    end;
    v_port := v_match[2];
  else
    v_match := regexp_match(p_authority, '^([^:]+)(?::([0-9]+))?$');
    if v_match is null then
      return false;
    end if;
    v_host := v_match[1];
    v_port := v_match[2];

    if v_host ~ '^[0-9.]+$' then
      if v_host !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
        return false;
      end if;
      begin
        if family(v_host::inet) <> 4 then
          return false;
        end if;
      exception when invalid_text_representation then
        return false;
      end;
    elsif lower(v_host) <> 'localhost' and v_host !~* '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?))*\.?$' then
      return false;
    end if;
  end if;

  if v_port is not null then
    begin
      if v_port::integer < 1 or v_port::integer > 65535 then
        return false;
      end if;
    exception when numeric_value_out_of_range then
      return false;
    end;
  end if;
  return true;
end;
$$;

create or replace function public.sanitize_recipe_source_url(p_source_url text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_url text := btrim(p_source_url);
  v_match text[];
  v_authority text;
  v_base text;
  v_query text;
  v_parameter text;
  v_key text;
  v_value text;
  v_decoded_key text;
  v_decoded_value text;
  v_kept text[] := array[]::text[];
begin
  if v_url = '' or length(v_url) > 2048 then
    return null;
  end if;
  v_match := regexp_match(v_url, '^(https?)://([^/?#]+)(.*)$', 'i');
  if v_match is null then
    return null;
  end if;
  v_authority := v_match[2];
  if not public.is_valid_recipe_url_authority(v_authority) then
    return null;
  end if;

  -- Fragments are client-local and can contain credentials or import payloads.
  v_url := regexp_replace(v_url, '#.*$', '');
  if position('?' in v_url) = 0 then
    return v_url;
  end if;

  v_base := split_part(v_url, '?', 1);
  v_query := substr(v_url, position('?' in v_url) + 1);
  foreach v_parameter in array string_to_array(v_query, '&') loop
    if v_parameter = '' then
      continue;
    end if;
    v_key := split_part(v_parameter, '=', 1);
    if position('=' in v_parameter) = 0 then
      v_value := '';
    else
      v_value := substr(v_parameter, position('=' in v_parameter) + 1);
    end if;
    v_decoded_key := public.decode_recipe_query_component(v_key);
    v_decoded_value := public.decode_recipe_query_component(v_value);
    if v_decoded_key is null or v_decoded_value is null
      or v_decoded_key ~ '[[:cntrl:]]'
      or v_decoded_value ~ '[[:cntrl:]]' then
      continue;
    end if;
    if not public.is_sensitive_recipe_query_key(v_key) then
      v_kept := array_append(v_kept, v_parameter);
    end if;
  end loop;

  if cardinality(v_kept) = 0 then
    return v_base;
  end if;
  return v_base || '?' || array_to_string(v_kept, '&');
end;
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_memberships hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

-- Replace the signup trigger boundary with an empty lookup path and no dead
-- slot-ID capture. The seeded default Dinner behavior remains unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  insert into public.households (name)
  values ('My Household')
  returning id into v_household_id;

  insert into public.household_memberships (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  insert into public.meal_slots (household_id, name, sort_order, is_default)
  values (v_household_id, 'Dinner', 10, true);

  return new;
end;
$$;

-- The remaining older trigger function already schema-qualifies its relations.
-- Remove the mutable public schema from its lookup path as well.
alter function public.validate_meal_plan_entry_household() set search_path = '';

-- Retailer/provider integration is not part of the shipped MVP. Remove the
-- unused table, policy, and grants rather than carrying an unowned data surface.
drop table public.shopping_providers;

-- Converge already-persisted URLs before validating the canonical constraint.
-- Unsafe or unparsable legacy values become null; safe values lose fragments
-- and sensitive query parameters deterministically.
update public.recipes
set source_url = public.sanitize_recipe_source_url(source_url)
where source_url is not null
  and source_url is distinct from public.sanitize_recipe_source_url(source_url);

-- ---------------------------------------------------------------------------
-- Structural integrity and historical ledger support
-- ---------------------------------------------------------------------------

alter table public.pantry_items
  add column version bigint not null default 1,
  add column normalized_item_name text
    generated always as (lower(btrim(item_name))) stored;

-- Pantry lots are deliberately not an MVP feature. Refuse to guess how
-- pre-existing duplicate quantities should be merged; an operator must resolve
-- them before this migration can safely establish the one-name invariant.
do $$
begin
  if exists (
    select 1
    from public.pantry_items
    group by household_id, normalized_item_name
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate normalized pantry item names must be resolved before migration 0005';
  end if;
end;
$$;

create unique index pantry_items_household_normalized_name_key
  on public.pantry_items(household_id, normalized_item_name);

-- A deduction is a historical snapshot. Once an ingredient is replaced during
-- a later recipe edit, retain the snapshot and clear only its live reference.
alter table public.pantry_deductions
  drop constraint pantry_deductions_recipe_ingredient_id_fkey,
  alter column recipe_ingredient_id drop not null;

alter table public.pantry_deductions
  add constraint pantry_deductions_recipe_ingredient_id_fkey
  foreign key (recipe_ingredient_id)
  references public.recipe_ingredients(id)
  on delete set null
  not valid;
alter table public.pantry_deductions
  validate constraint pantry_deductions_recipe_ingredient_id_fkey;

-- Re-completing a reversed meal appends a new snapshot rather than overwriting
-- the prior completion. Only one non-reversed row per current ingredient may
-- exist at a time.
alter table public.pantry_deductions
  drop constraint pantry_deductions_meal_plan_entry_id_recipe_ingredient_id_key;

create unique index pantry_deductions_active_entry_ingredient_key
  on public.pantry_deductions(meal_plan_entry_id, recipe_ingredient_id)
  where status in ('applied', 'review_required') and recipe_ingredient_id is not null;

create index idx_pantry_deductions_pantry_item_id
  on public.pantry_deductions(pantry_item_id)
  where pantry_item_id is not null;
create index idx_pantry_deductions_recipe_ingredient_id
  on public.pantry_deductions(recipe_ingredient_id)
  where recipe_ingredient_id is not null;
create index idx_shopping_lists_household_created_at
  on public.shopping_lists(household_id, created_at desc);

-- Parent household ownership is immutable. This closes cross-household
-- reparenting even for non-PostgREST callers and keeps child relationships safe.
create or replace function public.reject_household_reparenting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception using errcode = '23514', message = 'household ownership is immutable';
  end if;
  return new;
end;
$$;

create trigger recipes_reject_household_reparenting
before update of household_id on public.recipes
for each row execute function public.reject_household_reparenting();
create trigger meal_slots_reject_household_reparenting
before update of household_id on public.meal_slots
for each row execute function public.reject_household_reparenting();
create trigger meal_plan_entries_reject_household_reparenting
before update of household_id on public.meal_plan_entries
for each row execute function public.reject_household_reparenting();
create trigger pantry_items_reject_household_reparenting
before update of household_id on public.pantry_items
for each row execute function public.reject_household_reparenting();
create trigger shopping_lists_reject_household_reparenting
before update of household_id on public.shopping_lists
for each row execute function public.reject_household_reparenting();

create or replace function public.reject_child_reparenting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'recipe_ingredients' and new.recipe_id is distinct from old.recipe_id then
    raise exception using errcode = '23514', message = 'recipe ingredient ownership is immutable';
  elsif tg_table_name = 'shopping_list_items' and new.shopping_list_id is distinct from old.shopping_list_id then
    raise exception using errcode = '23514', message = 'shopping item ownership is immutable';
  end if;
  return new;
end;
$$;

create trigger recipe_ingredients_reject_reparenting
before update of recipe_id on public.recipe_ingredients
for each row execute function public.reject_child_reparenting();
create trigger shopping_list_items_reject_reparenting
before update of shopping_list_id on public.shopping_list_items
for each row execute function public.reject_child_reparenting();

-- Recipe ingredients are locked while a completion is active: ingredient
-- writes and completion take the same recipe-row lock so completion cannot
-- observe a partially replaced ingredient set.
create or replace function public.lock_recipe_for_ingredient_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recipe_id uuid;
begin
  v_recipe_id := case when tg_op = 'DELETE' then old.recipe_id else new.recipe_id end;
  perform 1 from public.recipes where id = v_recipe_id for update;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger recipe_ingredients_lock_recipe
before insert or update or delete on public.recipe_ingredients
for each row execute function public.lock_recipe_for_ingredient_change();

-- Ledger snapshot fields cannot be rewritten. Reversal is the sole permitted
-- state change and must timestamp the transition.
create or replace function public.enforce_pantry_deduction_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.household_id is distinct from old.household_id
    or new.meal_plan_entry_id is distinct from old.meal_plan_entry_id
    or new.item_name is distinct from old.item_name
    or new.quantity is distinct from old.quantity
    or new.unit is distinct from old.unit
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'pantry deduction history is immutable';
  end if;

  -- Foreign-key cleanup may clear a deleted live reference, but cannot alter
  -- the snapshot or lifecycle state.
  if new.status = old.status
    and new.reversed_at is not distinct from old.reversed_at
    and (new.pantry_item_id is not distinct from old.pantry_item_id
      or (old.pantry_item_id is not null and new.pantry_item_id is null))
    and (new.recipe_ingredient_id is not distinct from old.recipe_ingredient_id
      or (old.recipe_ingredient_id is not null and new.recipe_ingredient_id is null)) then
    return new;
  end if;

  -- Reversal may change only lifecycle state; references and snapshots remain.
  if new.pantry_item_id is not distinct from old.pantry_item_id
    and new.recipe_ingredient_id is not distinct from old.recipe_ingredient_id
    and old.status in ('applied', 'review_required')
    and new.status = 'reversed'
    and old.reversed_at is null
    and new.reversed_at is not null then
    return new;
  end if;

  raise exception using errcode = '23514', message = 'pantry deduction history is immutable';
  return new;
end;
$$;

create trigger pantry_deductions_enforce_history
before update on public.pantry_deductions
for each row execute function public.enforce_pantry_deduction_history();

-- The historical ingredient reference may legitimately be null after recipe
-- replacement. New live references still must belong to the entry's recipe.
create or replace function public.validate_pantry_deduction_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.meal_plan_entries mpe
    where mpe.id = new.meal_plan_entry_id and mpe.household_id = new.household_id
  ) then
    raise exception 'meal plan entry must belong to deduction household';
  end if;

  if new.pantry_item_id is not null and not exists (
    select 1 from public.pantry_items pi
    where pi.id = new.pantry_item_id and pi.household_id = new.household_id
  ) then
    raise exception 'pantry item must belong to deduction household';
  end if;

  if new.recipe_ingredient_id is not null and not exists (
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

-- ---------------------------------------------------------------------------
-- Database-level value contracts
-- ---------------------------------------------------------------------------

alter table public.profiles add constraint profiles_display_name_check
  check (display_name is null or (btrim(display_name) <> '' and length(display_name) <= 500)) not valid;
alter table public.households add constraint households_name_check
  check (btrim(name) <> '' and length(name) <= 500) not valid;
alter table public.meal_slots add constraint meal_slots_values_check
  check (btrim(name) <> '' and length(name) <= 100 and sort_order >= 0) not valid;
alter table public.recipes add constraint recipes_values_check
  check (
    btrim(title) <> '' and length(title) <= 500
    and (description is null or length(description) <= 10000)
    and (source_url is null or (
      length(source_url) <= 2048
      and public.sanitize_recipe_source_url(source_url) is not null
      and source_url = public.sanitize_recipe_source_url(source_url)
    ))
    and (servings is null or (servings > 0 and servings <= 10000 and servings <> 'NaN'::numeric))
    and length(instructions) <= 100000
  ) not valid;
alter table public.recipe_ingredients add constraint recipe_ingredients_values_check
  check (
    btrim(item_name) <> '' and length(item_name) <= 500
    and (quantity is null or (quantity > 0 and quantity <> 'NaN'::numeric))
    and (unit is null or (btrim(unit) <> '' and length(unit) <= 100))
    and (notes is null or length(notes) <= 2000)
    and display_order >= 0
  ) not valid;
alter table public.meal_plan_entries add constraint meal_plan_entries_date_check
  check (isfinite(planned_for)) not valid;
alter table public.pantry_items add constraint pantry_items_values_check
  check (
    btrim(item_name) <> '' and length(item_name) <= 500
    and quantity >= 0 and quantity <> 'NaN'::numeric
    and public.canonical_cooking_unit(unit) is not null
    and unit = public.canonical_cooking_unit(unit)
    and (category is null or length(category) <= 500)
    and (expiry_date is null or isfinite(expiry_date))
    and version > 0
  ) not valid;
alter table public.pantry_deductions add constraint pantry_deductions_values_check
  check (
    btrim(item_name) <> '' and length(item_name) <= 500
    and quantity >= 0 and quantity <> 'NaN'::numeric
    and btrim(unit) <> '' and length(unit) <= 100
    and ((status = 'reversed' and reversed_at is not null) or (status <> 'reversed' and reversed_at is null))
  ) not valid;
alter table public.shopping_lists add constraint shopping_lists_values_check
  check (
    btrim(name) <> '' and length(name) <= 500
    and isfinite(start_date) and isfinite(end_date)
    and end_date >= start_date and end_date - start_date <= 31
  ) not valid;
alter table public.shopping_list_items add constraint shopping_list_items_values_check
  check (
    btrim(item_name) <> '' and length(item_name) <= 500
    and (required_quantity is null or required_quantity <> 'NaN'::numeric)
    and (pantry_quantity is null or (pantry_quantity >= 0 and pantry_quantity <> 'NaN'::numeric))
    and (delta_quantity is null or delta_quantity <> 'NaN'::numeric)
    and (unit is null or (btrim(unit) <> '' and length(unit) <= 100))
    and (review_reason is null or length(review_reason) <= 2000)
  ) not valid;

alter table public.profiles validate constraint profiles_display_name_check;
alter table public.households validate constraint households_name_check;
alter table public.meal_slots validate constraint meal_slots_values_check;
alter table public.recipes validate constraint recipes_values_check;
alter table public.recipe_ingredients validate constraint recipe_ingredients_values_check;
alter table public.meal_plan_entries validate constraint meal_plan_entries_date_check;
alter table public.pantry_items validate constraint pantry_items_values_check;
alter table public.pantry_deductions validate constraint pantry_deductions_values_check;
alter table public.shopping_lists validate constraint shopping_lists_values_check;
alter table public.shopping_list_items validate constraint shopping_list_items_values_check;

-- ---------------------------------------------------------------------------
-- Transactional authenticated mutation APIs
-- ---------------------------------------------------------------------------

-- Every lifecycle RPC takes this transaction-scoped lock before it takes any
-- mutable row lock.  The logical key is stable across assignment (including a
-- not-yet-created entry), status changes, completion, and reversal.  A hash
-- collision only causes harmless extra serialization; it cannot merge data.
create or replace function public.lock_meal_plan_lifecycle(
  p_household_id uuid,
  p_meal_slot_id uuid,
  p_planned_for date
)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_household_id::text || ':' || p_meal_slot_id::text || ':' || p_planned_for::text,
      0
    )
  )
$$;

create or replace function public.assign_dinner(
  p_household_id uuid,
  p_planned_for date,
  p_recipe_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_entry_id uuid;
  v_status public.meal_plan_status;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_planned_for is null or not isfinite(p_planned_for) then
    raise exception using errcode = '22023', message = 'planned date is invalid';
  end if;

  select ms.id into v_slot_id
  from public.meal_slots ms
  where ms.household_id = p_household_id and ms.name = 'Dinner' and ms.is_default;
  if not found then
    raise exception using errcode = 'P0002', message = 'default Dinner slot not found';
  end if;

  -- Lock order for every lifecycle mutation is: logical slot, entry, recipe,
  -- pantry rows by id, then deduction rows.  Lock an existing entry before the
  -- target recipe so completion can never hold the entry while assignment
  -- holds the recipe.
  perform public.lock_meal_plan_lifecycle(p_household_id, v_slot_id, p_planned_for);

  select mpe.id, mpe.status
    into v_entry_id, v_status
  from public.meal_plan_entries mpe
  where mpe.household_id = p_household_id
    and mpe.meal_slot_id = v_slot_id
    and mpe.planned_for = p_planned_for
  for update;

  if found and v_status = 'completed' then
    raise exception using errcode = '55000', message = 'a completed meal must be reversed before assignment';
  end if;

  perform 1 from public.recipes r
  where r.id = p_recipe_id and r.household_id = p_household_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'recipe not found in household';
  end if;

  if v_entry_id is null then
    insert into public.meal_plan_entries (
      household_id, meal_slot_id, recipe_id, planned_for, status
    ) values (
      p_household_id, v_slot_id, p_recipe_id, p_planned_for, 'planned'
    )
    returning id into v_entry_id;
  else
    update public.meal_plan_entries
    set recipe_id = p_recipe_id, status = 'planned', updated_at = now()
    where id = v_entry_id;
  end if;

  return v_entry_id;
end;
$$;

create or replace function public.set_dinner_status(
  p_entry_id uuid,
  p_target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_slot_id uuid;
  v_planned_for date;
  v_status public.meal_plan_status;
begin
  select mpe.household_id, mpe.meal_slot_id, mpe.planned_for
    into v_household_id, v_slot_id, v_planned_for
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id and ms.name = 'Dinner' and ms.is_default;
  if not found then
    raise exception using errcode = 'P0002', message = 'Dinner entry not found';
  end if;
  if auth.uid() is null or not public.is_household_member(v_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_target_status not in ('planned', 'skipped') then
    raise exception using errcode = '22023', message = 'only planned and skipped transitions are accepted';
  end if;

  perform public.lock_meal_plan_lifecycle(v_household_id, v_slot_id, v_planned_for);

  select mpe.status into v_status
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id
    and mpe.household_id = v_household_id
    and mpe.meal_slot_id = v_slot_id
    and mpe.planned_for = v_planned_for
    and ms.name = 'Dinner'
    and ms.is_default
  for update of mpe;
  if not found then
    raise exception using errcode = '40001', message = 'Dinner entry changed during status transition';
  end if;

  if v_status::text = p_target_status then
    return;
  end if;
  if not ((v_status = 'planned' and p_target_status = 'skipped')
    or (v_status = 'skipped' and p_target_status = 'planned')) then
    raise exception using errcode = '55000', message = 'invalid Dinner status transition';
  end if;

  update public.meal_plan_entries
  set status = p_target_status::public.meal_plan_status, updated_at = now()
  where id = p_entry_id;
end;
$$;

create or replace function public.complete_meal_plan_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_slot_id uuid;
  v_planned_for date;
  v_recipe_id uuid;
  v_status public.meal_plan_status;
begin
  select mpe.household_id, mpe.meal_slot_id, mpe.planned_for
    into v_household_id, v_slot_id, v_planned_for
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id and ms.name = 'Dinner' and ms.is_default;
  if not found then
    raise exception using errcode = 'P0002', message = 'Dinner entry not found';
  end if;
  if auth.uid() is null or not public.is_household_member(v_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;

  perform public.lock_meal_plan_lifecycle(v_household_id, v_slot_id, v_planned_for);

  select mpe.recipe_id, mpe.status
    into v_recipe_id, v_status
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id
    and mpe.household_id = v_household_id
    and mpe.meal_slot_id = v_slot_id
    and mpe.planned_for = v_planned_for
    and ms.name = 'Dinner'
    and ms.is_default
  for update of mpe;
  if not found then
    raise exception using errcode = '40001', message = 'Dinner entry changed during completion';
  end if;

  if v_status = 'completed' then
    return;
  end if;
  if v_status <> 'planned' then
    raise exception using errcode = '55000', message = 'only planned dinners can be completed';
  end if;

  -- The ingredient trigger takes this same lock for every ingredient write.
  perform 1 from public.recipes where id = v_recipe_id for update;
  if not exists (select 1 from public.recipe_ingredients where recipe_id = v_recipe_id) then
    raise exception using errcode = '55000', message = 'a meal cannot be completed without recipe ingredients';
  end if;

  -- Lock all matching pantry rows in a stable order before deriving quantities.
  perform 1
  from public.pantry_items pi
  where pi.household_id = v_household_id
    and pi.normalized_item_name in (
      select lower(btrim(ri.item_name))
      from public.recipe_ingredients ri where ri.recipe_id = v_recipe_id
    )
  order by pi.id
  for update;

  create temporary table if not exists pg_temp.canonical_meal_deduction_plan (
    recipe_ingredient_id uuid primary key,
    pantry_item_id uuid,
    item_name text not null,
    quantity numeric not null,
    unit text not null,
    status public.deduction_status not null
  ) on commit drop;
  truncate table pg_temp.canonical_meal_deduction_plan;

  insert into pg_temp.canonical_meal_deduction_plan (
    recipe_ingredient_id, pantry_item_id, item_name, quantity, unit, status
  )
  with converted as (
    select
      ri.id as recipe_ingredient_id,
      pi.id as pantry_item_id,
      ri.item_name,
      ri.quantity as ingredient_quantity,
      ri.unit as ingredient_unit,
      pi.quantity as pantry_quantity,
      pi.unit as pantry_unit,
      case
        when ri.quantity is not null
          and ri.quantity > 0
          and ri.unit is not null
          and pi.id is not null
          and public.cooking_units_are_compatible(ri.unit, pi.unit)
        then ri.quantity
          * public.cooking_unit_base_factor(ri.unit)
          / public.cooking_unit_base_factor(pi.unit)
        else null
      end as converted_quantity
    from public.recipe_ingredients ri
    left join public.pantry_items pi
      on pi.household_id = v_household_id
      and pi.normalized_item_name = lower(btrim(ri.item_name))
    where ri.recipe_id = v_recipe_id
  ), assessed as (
    select converted.*,
      sum(converted_quantity) over (partition by pantry_item_id) as total_requested
    from converted
  )
  select
    recipe_ingredient_id,
    pantry_item_id,
    item_name,
    coalesce(converted_quantity, ingredient_quantity, 0),
    coalesce(
      case when converted_quantity is not null then pantry_unit end,
      public.canonical_cooking_unit(ingredient_unit),
      nullif(btrim(ingredient_unit), ''),
      'unknown'
    ),
    case
      when converted_quantity is not null and total_requested <= pantry_quantity
        then 'applied'::public.deduction_status
      else 'review_required'::public.deduction_status
    end
  from assessed;

  update public.pantry_items pi
  set quantity = pi.quantity - requested.quantity,
      version = pi.version + 1,
      updated_at = now()
  from (
    select pantry_item_id, sum(quantity) as quantity
    from pg_temp.canonical_meal_deduction_plan
    where status = 'applied'
    group by pantry_item_id
  ) requested
  where pi.id = requested.pantry_item_id and pi.household_id = v_household_id;

  insert into public.pantry_deductions (
    household_id, meal_plan_entry_id, pantry_item_id, recipe_ingredient_id,
    item_name, quantity, unit, status, reversed_at
  )
  select v_household_id, p_entry_id, pantry_item_id, recipe_ingredient_id,
    item_name, quantity, unit, status, null
  from pg_temp.canonical_meal_deduction_plan;

  update public.meal_plan_entries
  set status = 'completed', updated_at = now()
  where id = p_entry_id and status = 'planned';
  if not found then
    raise exception using errcode = '40001', message = 'meal status changed during completion';
  end if;
end;
$$;

create or replace function public.reverse_meal_completion_deductions(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_slot_id uuid;
  v_planned_for date;
  v_status public.meal_plan_status;
begin
  select mpe.household_id, mpe.meal_slot_id, mpe.planned_for
    into v_household_id, v_slot_id, v_planned_for
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id and ms.name = 'Dinner' and ms.is_default;
  if not found then
    raise exception using errcode = 'P0002', message = 'Dinner entry not found';
  end if;
  if auth.uid() is null or not public.is_household_member(v_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;

  perform public.lock_meal_plan_lifecycle(v_household_id, v_slot_id, v_planned_for);

  select mpe.status into v_status
  from public.meal_plan_entries mpe
  join public.meal_slots ms
    on ms.id = mpe.meal_slot_id and ms.household_id = mpe.household_id
  where mpe.id = p_entry_id
    and mpe.household_id = v_household_id
    and mpe.meal_slot_id = v_slot_id
    and mpe.planned_for = v_planned_for
    and ms.name = 'Dinner'
    and ms.is_default
  for update of mpe;
  if not found then
    raise exception using errcode = '40001', message = 'Dinner entry changed during reversal';
  end if;

  if v_status = 'planned' then
    return;
  end if;
  if v_status <> 'completed' then
    raise exception using errcode = '55000', message = 'only completed dinners can be reversed';
  end if;

  perform 1
  from public.pantry_items pi
  where pi.id in (
    select pd.pantry_item_id
    from public.pantry_deductions pd
    where pd.household_id = v_household_id
      and pd.meal_plan_entry_id = p_entry_id
      and pd.status = 'applied'
      and pd.pantry_item_id is not null
  )
  order by pi.id
  for update;

  -- Pantry rows are always locked first; lock the corresponding ledger rows
  -- in primary-key order before validating and reversing their snapshots.
  perform 1
  from public.pantry_deductions pd
  where pd.household_id = v_household_id
    and pd.meal_plan_entry_id = p_entry_id
    and pd.status in ('applied', 'review_required')
  order by pd.id
  for update;

  if exists (
    select 1
    from public.pantry_deductions pd
    left join public.pantry_items pi
      on pi.id = pd.pantry_item_id and pi.household_id = pd.household_id
    where pd.household_id = v_household_id
      and pd.meal_plan_entry_id = p_entry_id
      and pd.status = 'applied'
      and (pi.id is null or pi.unit is distinct from pd.unit)
  ) then
    raise exception using errcode = '55000', message = 'pantry item missing or unit changed; reversal requires review';
  end if;

  update public.pantry_items pi
  set quantity = pi.quantity + restores.quantity,
      version = pi.version + 1,
      updated_at = now()
  from (
    select pantry_item_id, sum(quantity) as quantity
    from public.pantry_deductions
    where household_id = v_household_id
      and meal_plan_entry_id = p_entry_id
      and status = 'applied'
    group by pantry_item_id
  ) restores
  where pi.id = restores.pantry_item_id and pi.household_id = v_household_id;

  update public.pantry_deductions
  set status = 'reversed', reversed_at = now()
  where household_id = v_household_id
    and meal_plan_entry_id = p_entry_id
    and status in ('applied', 'review_required');

  update public.meal_plan_entries
  set status = 'planned', updated_at = now()
  where id = p_entry_id and status = 'completed';
  if not found then
    raise exception using errcode = '40001', message = 'meal status changed during reversal';
  end if;
end;
$$;

create or replace function public.create_pantry_item(
  p_household_id uuid,
  p_item_name text,
  p_quantity numeric,
  p_unit text,
  p_category text default null,
  p_expiry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_unit text := public.canonical_cooking_unit(p_unit);
  v_name text := btrim(p_item_name);
  v_category text := nullif(btrim(p_category), '');
  v_existing public.pantry_items%rowtype;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if v_name is null or v_name = '' or length(v_name) > 500
    or p_quantity is null or p_quantity < 0 or p_quantity = 'NaN'::numeric
    or v_unit is null
    or (v_category is not null and length(v_category) > 500)
    or (p_expiry_date is not null and not isfinite(p_expiry_date)) then
    raise exception using errcode = '22023', message = 'pantry item values are invalid';
  end if;

  insert into public.pantry_items (
    household_id, item_name, quantity, unit, category, expiry_date
  ) values (
    p_household_id, v_name, p_quantity, v_unit, v_category, p_expiry_date
  )
  on conflict (household_id, normalized_item_name) do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
  from public.pantry_items
  where household_id = p_household_id and normalized_item_name = lower(v_name)
  for update;
  if v_existing.quantity = p_quantity
    and v_existing.unit = v_unit
    and v_existing.category is not distinct from v_category
    and v_existing.expiry_date is not distinct from p_expiry_date then
    return v_existing.id;
  end if;
  raise exception using errcode = '23505', message = 'a pantry item with this normalized name already exists';
end;
$$;

create or replace function public.update_pantry_item(
  p_item_id uuid,
  p_expected_version bigint,
  p_item_name text,
  p_quantity numeric,
  p_unit text,
  p_category text default null,
  p_expiry_date date default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.pantry_items%rowtype;
  v_unit text := public.canonical_cooking_unit(p_unit);
  v_name text := btrim(p_item_name);
  v_category text := nullif(btrim(p_category), '');
begin
  select * into v_item from public.pantry_items where id = p_item_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pantry item not found';
  end if;
  if auth.uid() is null or not public.is_household_member(v_item.household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_expected_version is null or p_expected_version <> v_item.version then
    raise exception using errcode = '40001', message = 'pantry item changed; reload before editing';
  end if;
  if v_name is null or v_name = '' or length(v_name) > 500
    or p_quantity is null or p_quantity < 0 or p_quantity = 'NaN'::numeric
    or v_unit is null
    or (v_category is not null and length(v_category) > 500)
    or (p_expiry_date is not null and not isfinite(p_expiry_date)) then
    raise exception using errcode = '22023', message = 'pantry item values are invalid';
  end if;
  if v_unit <> v_item.unit and exists (
    select 1 from public.pantry_deductions pd
    where pd.pantry_item_id = p_item_id and pd.status = 'applied'
  ) then
    raise exception using errcode = '55000', message = 'reverse completed meals before changing this pantry unit';
  end if;

  update public.pantry_items
  set item_name = v_name,
      quantity = p_quantity,
      unit = v_unit,
      category = v_category,
      expiry_date = p_expiry_date,
      version = version + 1,
      updated_at = now()
  where id = p_item_id
  returning version into p_expected_version;
  return p_expected_version;
end;
$$;

create or replace function public.delete_pantry_item(
  p_item_id uuid,
  p_expected_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.pantry_items%rowtype;
begin
  select * into v_item from public.pantry_items where id = p_item_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pantry item not found';
  end if;
  if auth.uid() is null or not public.is_household_member(v_item.household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_expected_version is null or p_expected_version <> v_item.version then
    raise exception using errcode = '40001', message = 'pantry item changed; reload before deleting';
  end if;
  if exists (
    select 1 from public.pantry_deductions pd
    where pd.pantry_item_id = p_item_id and pd.status = 'applied'
  ) then
    raise exception using errcode = '55000', message = 'reverse completed meals before deleting this pantry item';
  end if;
  delete from public.pantry_items where id = p_item_id;
end;
$$;

create or replace function public.create_recipe_with_ingredients(
  p_household_id uuid,
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
  v_source_url text;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_recipe is null
    or jsonb_typeof(p_recipe) <> 'object'
    or (p_recipe - array[
      'title', 'description', 'sourceUrl', 'favorite', 'servings',
      'instructions', 'ingestionStatus'
    ]) <> '{}'::jsonb
    or not (p_recipe ?& array[
      'title', 'description', 'sourceUrl', 'favorite', 'servings',
      'instructions', 'ingestionStatus'
    ])
    or jsonb_typeof(p_recipe->'title') <> 'string'
    or jsonb_typeof(p_recipe->'description') not in ('string', 'null')
    or jsonb_typeof(p_recipe->'sourceUrl') not in ('string', 'null')
    or jsonb_typeof(p_recipe->'favorite') <> 'boolean'
    or jsonb_typeof(p_recipe->'servings') not in ('number', 'null')
    or jsonb_typeof(p_recipe->'instructions') <> 'string'
    or jsonb_typeof(p_recipe->'ingestionStatus') <> 'string' then
    raise exception using errcode = '22023', message = 'recipe metadata payload is invalid';
  end if;
  v_source_url := public.sanitize_recipe_source_url(p_recipe->>'sourceUrl');
  if p_recipe->>'sourceUrl' is not null and v_source_url is null then
    raise exception using errcode = '22023', message = 'recipe source URL is invalid or contains userinfo';
  end if;
  if p_ingredients is null
    or jsonb_typeof(p_ingredients) <> 'array'
    or jsonb_array_length(p_ingredients) < 1
    or jsonb_array_length(p_ingredients) > 500 then
    raise exception using errcode = '22023', message = 'recipe ingredients must be an array containing 1 to 500 items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ingredients) input(value)
    where jsonb_typeof(value) <> 'object'
      or (value - array['itemName', 'quantity', 'unit', 'notes']) <> '{}'::jsonb
      or not (value ? 'itemName')
      or jsonb_typeof(value->'itemName') <> 'string'
      or not (value ? 'quantity')
      or jsonb_typeof(value->'quantity') not in ('number', 'null')
      or not (value ? 'unit')
      or jsonb_typeof(value->'unit') not in ('string', 'null')
      or (value ? 'notes' and jsonb_typeof(value->'notes') not in ('string', 'null'))
  ) then
    raise exception using errcode = '22023', message = 'recipe ingredient payload is invalid';
  end if;

  insert into public.recipes (
    household_id, title, description, source_url, favorite, servings,
    instructions, ingestion_status
  ) values (
    p_household_id,
    p_recipe->>'title',
    p_recipe->>'description',
    v_source_url,
    (p_recipe->>'favorite')::boolean,
    (p_recipe->>'servings')::numeric,
    p_recipe->>'instructions',
    (p_recipe->>'ingestionStatus')::public.ingestion_status
  )
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, item_name, quantity, unit, notes, display_order
  )
  select
    v_recipe_id,
    value->>'itemName',
    (value->>'quantity')::numeric,
    value->>'unit',
    value->>'notes',
    (display_order - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality input(value, display_order);

  return v_recipe_id;
end;
$$;

create or replace function public.update_recipe_with_ingredients(
  p_recipe_id uuid,
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_source_url text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select r.household_id into v_household_id
  from public.recipes r
  where r.id = p_recipe_id and public.is_household_member(r.household_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'recipe not found in an authorized household';
  end if;
  if p_recipe is null
    or jsonb_typeof(p_recipe) <> 'object'
    or (p_recipe - array[
      'title', 'description', 'sourceUrl', 'favorite', 'servings',
      'instructions', 'ingestionStatus'
    ]) <> '{}'::jsonb
    or not (p_recipe ?& array[
      'title', 'description', 'sourceUrl', 'favorite', 'servings',
      'instructions', 'ingestionStatus'
    ])
    or jsonb_typeof(p_recipe->'title') <> 'string'
    or jsonb_typeof(p_recipe->'description') not in ('string', 'null')
    or jsonb_typeof(p_recipe->'sourceUrl') not in ('string', 'null')
    or jsonb_typeof(p_recipe->'favorite') <> 'boolean'
    or jsonb_typeof(p_recipe->'servings') not in ('number', 'null')
    or jsonb_typeof(p_recipe->'instructions') <> 'string'
    or jsonb_typeof(p_recipe->'ingestionStatus') <> 'string' then
    raise exception using errcode = '22023', message = 'recipe metadata payload is invalid';
  end if;
  v_source_url := public.sanitize_recipe_source_url(p_recipe->>'sourceUrl');
  if p_recipe->>'sourceUrl' is not null and v_source_url is null then
    raise exception using errcode = '22023', message = 'recipe source URL is invalid or contains userinfo';
  end if;
  if p_ingredients is null
    or jsonb_typeof(p_ingredients) <> 'array'
    or jsonb_array_length(p_ingredients) < 1
    or jsonb_array_length(p_ingredients) > 500 then
    raise exception using errcode = '22023', message = 'recipe ingredients must be an array containing 1 to 500 items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ingredients) input(value)
    where jsonb_typeof(value) <> 'object'
      or (value - array['id', 'itemName', 'quantity', 'unit', 'notes']) <> '{}'::jsonb
      or (value ? 'id' and jsonb_typeof(value->'id') not in ('string', 'null'))
      or not (value ? 'itemName')
      or jsonb_typeof(value->'itemName') <> 'string'
      or not (value ? 'quantity')
      or jsonb_typeof(value->'quantity') not in ('number', 'null')
      or not (value ? 'unit')
      or jsonb_typeof(value->'unit') not in ('string', 'null')
      or (value ? 'notes' and jsonb_typeof(value->'notes') not in ('string', 'null'))
  ) then
    raise exception using errcode = '22023', message = 'recipe ingredient payload is invalid';
  end if;

  create temporary table if not exists pg_temp.recipe_ingredient_update_input (
    input_id uuid unique,
    item_name text not null,
    quantity numeric,
    unit text,
    notes text,
    display_order integer not null
  ) on commit drop;
  truncate table pg_temp.recipe_ingredient_update_input;

  insert into pg_temp.recipe_ingredient_update_input (
    input_id, item_name, quantity, unit, notes, display_order
  )
  select
    case when value->'id' is null or value->'id' = 'null'::jsonb
      then null else (value->>'id')::uuid end,
    value->>'itemName',
    (value->>'quantity')::numeric,
    value->>'unit',
    value->>'notes',
    (display_order - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality input(value, display_order);

  if exists (
    select 1
    from pg_temp.recipe_ingredient_update_input input
    left join public.recipe_ingredients ri on ri.id = input.input_id
    where input.input_id is not null and ri.recipe_id is distinct from p_recipe_id
  ) then
    raise exception using errcode = '22023', message = 'ingredient IDs must belong to the updated recipe';
  end if;

  update public.recipes
  set title = p_recipe->>'title',
      description = p_recipe->>'description',
      source_url = v_source_url,
      favorite = (p_recipe->>'favorite')::boolean,
      servings = (p_recipe->>'servings')::numeric,
      instructions = p_recipe->>'instructions',
      ingestion_status = (p_recipe->>'ingestionStatus')::public.ingestion_status,
      updated_at = now()
  where id = p_recipe_id and household_id = v_household_id;

  update public.recipe_ingredients ri
  set item_name = input.item_name,
      quantity = input.quantity,
      unit = input.unit,
      notes = input.notes,
      display_order = input.display_order
  from pg_temp.recipe_ingredient_update_input input
  where ri.id = input.input_id and ri.recipe_id = p_recipe_id;

  -- Deleting an omitted ingredient clears only the live foreign-key reference
  -- in prior deductions; immutable item/quantity/unit snapshots remain.
  delete from public.recipe_ingredients ri
  where ri.recipe_id = p_recipe_id
    and not exists (
      select 1 from pg_temp.recipe_ingredient_update_input input
      where input.input_id = ri.id
    );

  insert into public.recipe_ingredients (
    recipe_id, item_name, quantity, unit, notes, display_order
  )
  select p_recipe_id, item_name, quantity, unit, notes, display_order
  from pg_temp.recipe_ingredient_update_input
  where input_id is null;

  return p_recipe_id;
end;
$$;

create or replace function public.create_shopping_list_with_items(
  p_household_id uuid,
  p_start_date date,
  p_end_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shopping_list_id uuid;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_start_date is null or p_end_date is null
    or not isfinite(p_start_date) or not isfinite(p_end_date)
    or p_end_date < p_start_date or p_end_date - p_start_date > 31 then
    raise exception using errcode = '22023', message = 'shopping-list date range is invalid';
  end if;
  -- 32 calendar days times the 500-ingredient recipe limit is the absolute
  -- dinner-only input ceiling before aggregation.
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 16000 then
    raise exception using errcode = '22023', message = 'shopping-list items must be an array of at most 16000 items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) input(value)
    where jsonb_typeof(value) <> 'object'
      or (value - array[
        'itemName', 'requiredQuantity', 'pantryQuantity', 'deltaQuantity',
        'unit', 'reviewRequired', 'reviewReason'
      ]) <> '{}'::jsonb
      or not (value ? 'itemName')
      or jsonb_typeof(value->'itemName') <> 'string'
      or not (value ? 'requiredQuantity')
      or jsonb_typeof(value->'requiredQuantity') not in ('number', 'null')
      or not (value ? 'pantryQuantity')
      or jsonb_typeof(value->'pantryQuantity') not in ('number', 'null')
      or not (value ? 'deltaQuantity')
      or jsonb_typeof(value->'deltaQuantity') not in ('number', 'null')
      or not (value ? 'unit')
      or jsonb_typeof(value->'unit') not in ('string', 'null')
      or not (value ? 'reviewRequired')
      or jsonb_typeof(value->'reviewRequired') <> 'boolean'
      or (value ? 'reviewReason' and jsonb_typeof(value->'reviewReason') not in ('string', 'null'))
      or ((value->>'requiredQuantity')::numeric < 0)
      or ((value->>'pantryQuantity')::numeric < 0)
      or ((value->>'deltaQuantity')::numeric < 0)
      or ((value->>'reviewRequired')::boolean = false
        and coalesce((value->>'deltaQuantity')::numeric, 0) <= 0)
      or ((value->>'reviewRequired')::boolean = true
        and nullif(btrim(value->>'reviewReason'), '') is null)
  ) then
    raise exception using errcode = '22023', message = 'shopping-list item payload is invalid';
  end if;

  insert into public.shopping_lists (
    household_id, name, start_date, end_date, status
  ) values (
    p_household_id,
    'Shopping list ' || p_start_date::text || ' to ' || p_end_date::text,
    p_start_date,
    p_end_date,
    'active'
  ) returning id into v_shopping_list_id;

  insert into public.shopping_list_items (
    shopping_list_id, item_name, required_quantity, pantry_quantity,
    delta_quantity, unit, status, review_required, review_reason
  )
  select
    v_shopping_list_id,
    value->>'itemName',
    (value->>'requiredQuantity')::numeric,
    (value->>'pantryQuantity')::numeric,
    (value->>'deltaQuantity')::numeric,
    value->>'unit',
    'needed',
    (value->>'reviewRequired')::boolean,
    value->>'reviewReason'
  from jsonb_array_elements(p_items) input(value);

  return v_shopping_list_id;
end;
$$;

create or replace function public.set_shopping_item_status(
  p_item_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_current_status public.shopping_item_status;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_status not in ('needed', 'checked', 'dismissed') then
    raise exception using errcode = '22023', message = 'shopping item status is invalid';
  end if;

  select sl.household_id, sli.status
    into v_household_id, v_current_status
  from public.shopping_list_items sli
  join public.shopping_lists sl on sl.id = sli.shopping_list_id
  where sli.id = p_item_id
    and public.is_household_member(sl.household_id)
  for update of sli;
  if not found then
    raise exception using errcode = 'P0002', message = 'shopping item not found in an authorized household';
  end if;
  if v_current_status::text = p_status then
    return;
  end if;

  update public.shopping_list_items
  set status = p_status::public.shopping_item_status,
      updated_at = now()
  where id = p_item_id;
end;
$$;

-- Remove the caller-authored JSON completion boundary. Deploy the matching app
-- change with this migration; there is deliberately no privileged compatibility
-- path that accepts untrusted deduction semantics.
revoke all on function public.apply_meal_completion_deductions(uuid, jsonb)
  from public, anon, authenticated;
drop function public.apply_meal_completion_deductions(uuid, jsonb);

-- ---------------------------------------------------------------------------
-- RLS and effective privilege convergence
-- ---------------------------------------------------------------------------

drop policy "meal_slots_member_all" on public.meal_slots;
drop policy "recipes_member_all" on public.recipes;
drop policy "recipe_ingredients_member_all" on public.recipe_ingredients;
drop policy "meal_plan_entries_member_all" on public.meal_plan_entries;
drop policy "pantry_items_member_all" on public.pantry_items;
drop policy "pantry_deductions_member_all" on public.pantry_deductions;
drop policy "shopping_lists_member_all" on public.shopping_lists;
drop policy "shopping_list_items_member_all" on public.shopping_list_items;

create policy "meal_slots_member_select" on public.meal_slots for select
  using ((select public.is_household_member(household_id)));
create policy "recipes_member_select" on public.recipes for select
  using ((select public.is_household_member(household_id)));
create policy "recipe_ingredients_member_select" on public.recipe_ingredients for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (select public.is_household_member(r.household_id))
  ));
create policy "meal_plan_entries_member_select" on public.meal_plan_entries for select
  using ((select public.is_household_member(household_id)));
create policy "pantry_items_member_select" on public.pantry_items for select
  using ((select public.is_household_member(household_id)));
create policy "pantry_deductions_member_select" on public.pantry_deductions for select
  using ((select public.is_household_member(household_id)));
create policy "shopping_lists_member_select" on public.shopping_lists for select
  using ((select public.is_household_member(household_id)));
create policy "shopping_list_items_member_select" on public.shopping_list_items for select
  using (exists (
    select 1 from public.shopping_lists sl
    where sl.id = shopping_list_id and (select public.is_household_member(sl.household_id))
  ));

revoke all privileges on schema public from PUBLIC;
revoke all privileges on schema public from anon, authenticated;
revoke all privileges on all tables in schema public from PUBLIC;
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from PUBLIC;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from PUBLIC;
revoke all privileges on all functions in schema public from anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.households to authenticated;
grant update (name) on table public.households to authenticated;
grant select on table public.household_memberships to authenticated;
grant select on table public.meal_slots to authenticated;
grant select on table public.recipes to authenticated;
grant select on table public.recipe_ingredients to authenticated;
grant select on table public.meal_plan_entries to authenticated;
grant select on table public.pantry_items to authenticated;
grant select on table public.pantry_deductions to authenticated;
grant select on table public.shopping_lists to authenticated;
grant select on table public.shopping_list_items to authenticated;

alter default privileges in schema public revoke all on tables from PUBLIC;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from PUBLIC;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from PUBLIC;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

revoke all on function public.canonical_cooking_unit(text) from public, anon, authenticated;
revoke all on function public.cooking_unit_base_factor(text) from public, anon, authenticated;
revoke all on function public.cooking_units_are_compatible(text, text) from public, anon, authenticated;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.canonical_cooking_unit(text) to service_role;
grant execute on function public.cooking_unit_base_factor(text) to service_role;
grant execute on function public.cooking_units_are_compatible(text, text) to service_role;
grant execute on function public.decode_recipe_query_component(text) to service_role;
grant execute on function public.is_sensitive_recipe_query_key(text) to service_role;
grant execute on function public.is_valid_recipe_url_authority(text) to service_role;
grant execute on function public.sanitize_recipe_source_url(text) to service_role;
grant execute on function public.is_household_member(uuid) to authenticated;

revoke all on function public.validate_meal_plan_entry_household() from public, anon, authenticated;
revoke all on function public.validate_pantry_deduction_household() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reject_household_reparenting() from public, anon, authenticated;
revoke all on function public.reject_child_reparenting() from public, anon, authenticated;
revoke all on function public.lock_recipe_for_ingredient_change() from public, anon, authenticated;
revoke all on function public.enforce_pantry_deduction_history() from public, anon, authenticated;
revoke all on function public.lock_meal_plan_lifecycle(uuid, uuid, date) from public, anon, authenticated;

revoke all on function public.assign_dinner(uuid, date, uuid) from public, anon;
revoke all on function public.set_dinner_status(uuid, text) from public, anon;
revoke all on function public.complete_meal_plan_entry(uuid) from public, anon;
revoke all on function public.reverse_meal_completion_deductions(uuid) from public, anon;
revoke all on function public.create_pantry_item(uuid, text, numeric, text, text, date) from public, anon;
revoke all on function public.update_pantry_item(uuid, bigint, text, numeric, text, text, date) from public, anon;
revoke all on function public.delete_pantry_item(uuid, bigint) from public, anon;
drop function if exists public.create_recipe_with_ingredients(uuid, text, text, text, boolean, numeric, text, text, jsonb);
drop function if exists public.update_recipe_with_ingredients(uuid, text, text, text, boolean, numeric, text, text, jsonb);
revoke all on function public.create_recipe_with_ingredients(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.update_recipe_with_ingredients(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.create_shopping_list_with_items(uuid, date, date, jsonb) from public, anon;
revoke all on function public.set_shopping_item_status(uuid, text) from public, anon;

grant execute on function public.assign_dinner(uuid, date, uuid) to authenticated;
grant execute on function public.set_dinner_status(uuid, text) to authenticated;
grant execute on function public.complete_meal_plan_entry(uuid) to authenticated;
grant execute on function public.reverse_meal_completion_deductions(uuid) to authenticated;
grant execute on function public.create_pantry_item(uuid, text, numeric, text, text, date) to authenticated;
grant execute on function public.update_pantry_item(uuid, bigint, text, numeric, text, text, date) to authenticated;
grant execute on function public.delete_pantry_item(uuid, bigint) to authenticated;
grant execute on function public.create_recipe_with_ingredients(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.update_recipe_with_ingredients(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.create_shopping_list_with_items(uuid, date, date, jsonb) to authenticated;
grant execute on function public.set_shopping_item_status(uuid, text) to authenticated;

-- Deployment assertion: has_*_privilege resolves role membership and PUBLIC
-- grants, unlike information_schema grant listings. These checks therefore fail
-- closed if a direct or inherited privilege re-opens the hardened Data API.
do $$
declare
  v_table text;
  v_rpc regprocedure;
begin
  if has_schema_privilege('anon', 'public', 'USAGE')
    or has_schema_privilege('anon', 'public', 'CREATE') then
    raise exception 'anonymous inherited public-schema privileges remain';
  end if;

  foreach v_table in array array[
    'public.profiles', 'public.households', 'public.household_memberships',
    'public.meal_slots', 'public.recipes', 'public.recipe_ingredients',
    'public.meal_plan_entries', 'public.pantry_items', 'public.pantry_deductions',
    'public.shopping_lists', 'public.shopping_list_items'
  ] loop
    if has_table_privilege('anon', v_table, 'SELECT')
      or has_table_privilege('anon', v_table, 'INSERT')
      or has_table_privilege('anon', v_table, 'UPDATE')
      or has_table_privilege('anon', v_table, 'DELETE') then
      raise exception 'anonymous inherited table privilege remains on %', v_table;
    end if;
    if not has_table_privilege('authenticated', v_table, 'SELECT') then
      raise exception 'authenticated read privilege missing on %', v_table;
    end if;
    if has_table_privilege('authenticated', v_table, 'INSERT')
      or has_table_privilege('authenticated', v_table, 'UPDATE')
      or has_table_privilege('authenticated', v_table, 'DELETE') then
      raise exception 'authenticated table-level mutation privilege remains on %', v_table;
    end if;
  end loop;

  if has_column_privilege('authenticated', 'public.recipes', 'household_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.meal_plan_entries', 'status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.pantry_items', 'quantity', 'UPDATE')
    or has_column_privilege('authenticated', 'public.pantry_deductions', 'status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.shopping_list_items', 'status', 'UPDATE') then
    raise exception 'authenticated protected-column mutation privilege remains';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('authenticated', c.oid, 'USAGE')
      )
  ) then
    raise exception 'Data API sequence usage privilege remains';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'anonymous inherited function execution privilege remains';
  end if;

  foreach v_rpc in array array[
    'public.assign_dinner(uuid,date,uuid)'::regprocedure,
    'public.set_dinner_status(uuid,text)'::regprocedure,
    'public.complete_meal_plan_entry(uuid)'::regprocedure,
    'public.reverse_meal_completion_deductions(uuid)'::regprocedure,
    'public.create_pantry_item(uuid,text,numeric,text,text,date)'::regprocedure,
    'public.update_pantry_item(uuid,bigint,text,numeric,text,text,date)'::regprocedure,
    'public.delete_pantry_item(uuid,bigint)'::regprocedure,
    'public.create_recipe_with_ingredients(uuid,jsonb,jsonb)'::regprocedure,
    'public.update_recipe_with_ingredients(uuid,jsonb,jsonb)'::regprocedure,
    'public.create_shopping_list_with_items(uuid,date,date,jsonb)'::regprocedure,
    'public.set_shopping_item_status(uuid,text)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception 'authenticated RPC execution privilege missing on %', v_rpc;
    end if;
  end loop;
end;
$$;

comment on column public.pantry_items.version is
  'Optimistic concurrency token. Supply the last-read value to pantry update/delete RPCs.';
comment on column public.pantry_items.normalized_item_name is
  'Case- and surrounding-whitespace-insensitive MVP pantry identity within a household.';
comment on function public.complete_meal_plan_entry(uuid) is
  'Completes one planned Dinner and derives the full deduction ledger from locked canonical rows.';
comment on function public.reverse_meal_completion_deductions(uuid) is
  'Reverses the active completion only when restorable pantry units still match ledger snapshots.';
