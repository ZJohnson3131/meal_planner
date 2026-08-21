-- Atomically persist an accepted, review-first weekly Dinner proposal. The
-- caller supplies only saved household recipe IDs or fully validated recipe
-- payloads; generated drafts are never persisted until this RPC is invoked.

create or replace function public.confirm_weekly_dinner_plan(
  p_household_id uuid,
  p_week_start date,
  p_assignments jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_assignment jsonb;
  v_recipe jsonb;
  v_ingredients jsonb;
  v_recipe_id uuid;
  v_entry_id uuid;
  v_existing_status public.meal_plan_status;
  v_planned_for date;
  v_assignment_date text;
  v_recipe_id_text text;
  v_entry_ids uuid[] := array[]::uuid[];
  v_seen_dates date[] := array[]::date[];
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'not authorized for this household';
  end if;
  if p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'week start must be a finite Monday date';
  end if;
  if p_assignments is null
    or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_array_length(p_assignments) < 1
    or jsonb_array_length(p_assignments) > 7 then
    raise exception using errcode = '22023', message = 'weekly assignments must contain between 1 and 7 items';
  end if;

  select ms.id into v_slot_id
  from public.meal_slots ms
  where ms.household_id = p_household_id
    and ms.name = 'Dinner'
    and ms.is_default;
  if not found then
    raise exception using errcode = 'P0002', message = 'default Dinner slot not found';
  end if;

  -- Validate every shape and take every lifecycle lock before writing a draft.
  -- This makes an invalid or concurrently completed entry roll back the entire
  -- proposal, including any generated recipes and ingredients.
  for v_assignment in select value from jsonb_array_elements(p_assignments) loop
    if jsonb_typeof(v_assignment) <> 'object'
      or (v_assignment - array['plannedFor', 'recipeId', 'generatedRecipe']) <> '{}'::jsonb
      or not (v_assignment ?& array['plannedFor', 'recipeId', 'generatedRecipe'])
      or jsonb_typeof(v_assignment->'plannedFor') <> 'string'
      or jsonb_typeof(v_assignment->'recipeId') not in ('string', 'null')
      or jsonb_typeof(v_assignment->'generatedRecipe') not in ('object', 'null') then
      raise exception using errcode = '22023', message = 'weekly assignment payload is invalid';
    end if;

    v_assignment_date := v_assignment->>'plannedFor';
    if v_assignment_date !~ '^\\d{4}-\\d{2}-\\d{2}$' then
      raise exception using errcode = '22023', message = 'assignment date is invalid';
    end if;
    begin
      v_planned_for := v_assignment_date::date;
    exception when others then
      raise exception using errcode = '22023', message = 'assignment date is invalid';
    end;
    if v_planned_for < p_week_start or v_planned_for > p_week_start + 6
      or v_planned_for = any(v_seen_dates) then
      raise exception using errcode = '22023', message = 'assignment dates must be unique dates in the selected Monday week';
    end if;
    v_seen_dates := array_append(v_seen_dates, v_planned_for);

    if (jsonb_typeof(v_assignment->'recipeId') = 'null')
      = (jsonb_typeof(v_assignment->'generatedRecipe') = 'null') then
      raise exception using errcode = '22023', message = 'each assignment must contain exactly one recipe source';
    end if;

    if jsonb_typeof(v_assignment->'recipeId') = 'string' then
      v_recipe_id_text := v_assignment->>'recipeId';
      if v_recipe_id_text !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' then
        raise exception using errcode = '22023', message = 'saved recipe ID is invalid';
      end if;
      v_recipe_id := v_recipe_id_text::uuid;
      perform 1 from public.recipes r
      where r.id = v_recipe_id and r.household_id = p_household_id
      for share;
      if not found then
        raise exception using errcode = 'P0002', message = 'recipe not found in household';
      end if;
    else
      v_recipe := v_assignment->'generatedRecipe'->'recipe';
      v_ingredients := v_assignment->'generatedRecipe'->'ingredients';
      if (v_assignment->'generatedRecipe' - array['recipe', 'ingredients']) <> '{}'::jsonb
        or not (v_assignment->'generatedRecipe' ?& array['recipe', 'ingredients']) then
        raise exception using errcode = '22023', message = 'generated recipe payload is invalid';
      end if;
      -- Delegate exact metadata, source URL, ingredient, and database-limit
      -- checks to the canonical recipe creation boundary after all locks are held.
    end if;

    perform public.lock_meal_plan_lifecycle(p_household_id, v_slot_id, v_planned_for);
    select mpe.status into v_existing_status
    from public.meal_plan_entries mpe
    where mpe.household_id = p_household_id
      and mpe.meal_slot_id = v_slot_id
      and mpe.planned_for = v_planned_for
    for update;
    if found and v_existing_status = 'completed' then
      raise exception using errcode = '55000', message = 'a completed meal must be reversed before assignment';
    end if;
  end loop;

  -- Every validation and lock above happens before this write phase.
  for v_assignment in select value from jsonb_array_elements(p_assignments) loop
    v_planned_for := (v_assignment->>'plannedFor')::date;
    if jsonb_typeof(v_assignment->'recipeId') = 'null' then
      v_recipe_id := public.create_recipe_with_ingredients(
        p_household_id,
        v_assignment->'generatedRecipe'->'recipe',
        v_assignment->'generatedRecipe'->'ingredients'
      );
    else
      v_recipe_id := (v_assignment->>'recipeId')::uuid;
    end if;

    select mpe.id into v_entry_id
    from public.meal_plan_entries mpe
    where mpe.household_id = p_household_id
      and mpe.meal_slot_id = v_slot_id
      and mpe.planned_for = v_planned_for
    for update;

    if v_entry_id is null then
      insert into public.meal_plan_entries (
        household_id, meal_slot_id, recipe_id, planned_for, status
      ) values (
        p_household_id, v_slot_id, v_recipe_id, v_planned_for, 'planned'
      ) returning id into v_entry_id;
    else
      update public.meal_plan_entries
      set recipe_id = v_recipe_id, status = 'planned', updated_at = now()
      where id = v_entry_id;
    end if;
    v_entry_ids := array_append(v_entry_ids, v_entry_id);
  end loop;

  return v_entry_ids;
end;
$$;

revoke all on function public.confirm_weekly_dinner_plan(uuid, date, jsonb)
  from public, anon;
grant execute on function public.confirm_weekly_dinner_plan(uuid, date, jsonb) to authenticated;

-- Fail migration deployment if an inherited grant reopens this privileged write
-- boundary or if authenticated callers cannot use the single intended API.
do $$
declare
  v_rpc regprocedure := 'public.confirm_weekly_dinner_plan(uuid,date,jsonb)'::regprocedure;
begin
  if has_function_privilege('anon', v_rpc, 'EXECUTE') then
    raise exception 'anonymous execution privilege remains on %', v_rpc;
  end if;
  if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
    raise exception 'authenticated RPC execution privilege missing on %', v_rpc;
  end if;
end;
$$;

comment on function public.confirm_weekly_dinner_plan(uuid, date, jsonb) is
  'Atomically creates accepted generated recipes and assigns saved/generated recipes to unique Dinner dates in one Monday-normalized week.';
