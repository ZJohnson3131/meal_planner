-- RLS controls row visibility; table privileges still control whether the
-- Supabase Data API can issue a query at all.  Keep anonymous callers without
-- table grants and give the app role only the operations used by the MVP.

grant usage on schema public to authenticated, service_role;

grant select, update on table public.profiles to authenticated;
grant select, update on table public.households to authenticated;
grant select on table public.household_memberships to authenticated;
grant select on table public.meal_slots to authenticated;

grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, update, delete on table public.recipe_ingredients to authenticated;
grant select, insert, update on table public.meal_plan_entries to authenticated;
grant select, insert, update, delete on table public.pantry_items to authenticated;
grant select on table public.pantry_deductions to authenticated;
grant select, insert, update on table public.shopping_lists to authenticated;
grant select, insert, update on table public.shopping_list_items to authenticated;
grant select on table public.shopping_providers to authenticated;

-- Integration/security fixtures use service_role. It bypasses RLS by design,
-- but Postgres still requires DML grants for the Data API role.
grant all privileges on table
  public.profiles,
  public.households,
  public.household_memberships,
  public.meal_slots,
  public.recipes,
  public.recipe_ingredients,
  public.meal_plan_entries,
  public.pantry_items,
  public.pantry_deductions,
  public.shopping_lists,
  public.shopping_list_items,
  public.shopping_providers
to service_role;
