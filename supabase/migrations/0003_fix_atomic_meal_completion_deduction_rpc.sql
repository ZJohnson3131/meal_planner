-- Correct the JSONB record alias in the already-released completion RPC.
-- Migration 0002 remains immutable for deployed databases; this replaces the
-- routine on upgrade while preserving its transaction and access boundaries.

create or replace function public.apply_meal_completion_deductions(
  p_entry_id uuid,
  p_deductions jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_household_id uuid;
  v_recipe_id uuid;
  v_status meal_plan_status;
  v_expected_count integer;
  v_received_count integer;
  v_distinct_count integer;
  v_updated_count integer;
begin
  if jsonb_typeof(p_deductions) <> 'array' then
    raise exception 'meal deductions must be an array';
  end if;

  select household_id, recipe_id, status
    into v_household_id, v_recipe_id, v_status
  from public.meal_plan_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'meal plan entry not found';
  end if;

  if not exists (
    select 1
    from public.household_memberships
    where household_id = v_household_id
      and user_id = auth.uid()
  ) then
    raise exception 'not authorized for this household';
  end if;

  if not exists (
    select 1
    from public.meal_slots
    where id = (select meal_slot_id from public.meal_plan_entries where id = p_entry_id)
      and household_id = v_household_id
      and name = 'Dinner'
      and is_default
  ) then
    raise exception 'only the default Dinner entry can be completed';
  end if;

  if v_status = 'completed' then
    return;
  end if;
  if v_status <> 'planned' then
    raise exception 'only planned dinners can be completed';
  end if;

  select count(*) into v_expected_count
  from public.recipe_ingredients
  where recipe_id = v_recipe_id;

  select count(*), count(distinct d."recipeIngredientId")
    into v_received_count, v_distinct_count
  from jsonb_to_recordset(p_deductions) as d(
    "recipeIngredientId" uuid,
    "pantryItemId" uuid,
    "itemName" text,
    quantity numeric,
    unit text,
    status deduction_status
  );

  if v_received_count <> v_expected_count or v_distinct_count <> v_expected_count then
    raise exception 'deductions must contain every recipe ingredient exactly once';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_deductions) as d(
      "recipeIngredientId" uuid,
      "pantryItemId" uuid,
      "itemName" text,
      quantity numeric,
      unit text,
      status deduction_status
    )
    left join public.recipe_ingredients ri on ri.id = d."recipeIngredientId"
    where ri.recipe_id is distinct from v_recipe_id
       or d.status not in ('applied', 'review_required')
       or d."itemName" is null or btrim(d."itemName") = ''
       or d.quantity is null or d.quantity < 0
       or d.unit is null or btrim(d.unit) = ''
       or (d.status = 'applied' and d."pantryItemId" is null)
  ) then
    raise exception 'invalid meal deduction payload';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_deductions) as d(
      "recipeIngredientId" uuid,
      "pantryItemId" uuid,
      "itemName" text,
      quantity numeric,
      unit text,
      status deduction_status
    )
    where d."pantryItemId" is not null
      and not exists (
        select 1 from public.pantry_items pi
        where pi.id = d."pantryItemId" and pi.household_id = v_household_id
      )
  ) then
    raise exception 'pantry item does not belong to this household';
  end if;

  perform 1
  from public.pantry_items pi
  where pi.id in (
    select d."pantryItemId"
    from jsonb_to_recordset(p_deductions) as d(
      "recipeIngredientId" uuid,
      "pantryItemId" uuid,
      "itemName" text,
      quantity numeric,
      unit text,
      status deduction_status
    )
    where d.status = 'applied'
  )
  for update;

  if exists (
    with requested as (
      select d."pantryItemId" as pantry_item_id, sum(d.quantity) as quantity
      from jsonb_to_recordset(p_deductions) as d(
        "recipeIngredientId" uuid,
        "pantryItemId" uuid,
        "itemName" text,
        quantity numeric,
        unit text,
        status deduction_status
      )
      where d.status = 'applied'
      group by d."pantryItemId"
    )
    select 1
    from requested r
    join public.pantry_items pi on pi.id = r.pantry_item_id
    where pi.quantity < r.quantity
  ) then
    raise exception 'insufficient pantry stock';
  end if;

  with requested as (
    select d."pantryItemId" as pantry_item_id, sum(d.quantity) as quantity
    from jsonb_to_recordset(p_deductions) as d(
      "recipeIngredientId" uuid,
      "pantryItemId" uuid,
      "itemName" text,
      quantity numeric,
      unit text,
      status deduction_status
    )
    where d.status = 'applied'
    group by d."pantryItemId"
  )
  update public.pantry_items pi
  set quantity = pi.quantity - requested.quantity,
      updated_at = now()
  from requested
  where pi.id = requested.pantry_item_id
    and pi.household_id = v_household_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> (
    select count(*)
    from (
      select d."pantryItemId"
      from jsonb_to_recordset(p_deductions) as d(
        "recipeIngredientId" uuid,
        "pantryItemId" uuid,
        "itemName" text,
        quantity numeric,
        unit text,
        status deduction_status
      )
      where d.status = 'applied'
      group by d."pantryItemId"
    ) requested
  ) then
    raise exception 'pantry stock changed before completion';
  end if;

  insert into public.pantry_deductions (
    household_id, meal_plan_entry_id, pantry_item_id, recipe_ingredient_id,
    item_name, quantity, unit, status, reversed_at
  )
  select
    v_household_id, p_entry_id, d."pantryItemId", d."recipeIngredientId",
    d."itemName", d.quantity, d.unit, d.status, null
  from jsonb_to_recordset(p_deductions) as d(
    "recipeIngredientId" uuid,
    "pantryItemId" uuid,
    "itemName" text,
    quantity numeric,
    unit text,
    status deduction_status
  )
  on conflict (meal_plan_entry_id, recipe_ingredient_id) do update
  set pantry_item_id = excluded.pantry_item_id,
      item_name = excluded.item_name,
      quantity = excluded.quantity,
      unit = excluded.unit,
      status = excluded.status,
      reversed_at = null;

  update public.meal_plan_entries
  set status = 'completed', updated_at = now()
  where id = p_entry_id and status = 'planned';

  if not found then
    raise exception 'meal status changed before completion';
  end if;
end;
$$;

revoke all on function public.apply_meal_completion_deductions(uuid, jsonb) from public, anon;
grant execute on function public.apply_meal_completion_deductions(uuid, jsonb) to authenticated;
