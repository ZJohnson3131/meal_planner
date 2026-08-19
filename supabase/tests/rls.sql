-- Run manually against the local database after creating two test users.
-- Expected result: authenticated users can only see rows in households where
-- they have a household_memberships row. Service-role access is not covered by
-- RLS and must never be exposed to browser code.
--
-- This query must return exactly the twelve listed tables. A missing row means
-- that a household-owned table does not have Row Level Security enabled.

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'households',
    'household_memberships',
    'meal_slots',
    'recipes',
    'recipe_ingredients',
    'meal_plan_entries',
    'pantry_items',
    'pantry_deductions',
    'shopping_lists',
    'shopping_list_items',
    'shopping_providers'
  )
  and rowsecurity is true
order by tablename;
