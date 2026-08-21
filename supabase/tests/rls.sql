-- Fail-closed RLS schema assertions for the verified local Supabase project.

begin;
select plan(6);

select is(
  (
    select coalesce(array_agg(tablename::text order by tablename), array[]::text[])
    from pg_tables
    where schemaname = 'public'
      and rowsecurity is true
  ),
  array[
    'household_memberships',
    'households',
    'meal_plan_entries',
    'meal_slots',
    'pantry_deductions',
    'pantry_items',
    'profiles',
    'recipe_ingredients',
    'recipes',
    'shopping_list_items',
    'shopping_lists'
  ]::text[],
  'RLS is enabled on exactly the eleven shipped household data tables'
);

select is(
  to_regclass('public.shopping_providers'),
  null::regclass,
  'the obsolete shopping_providers table is absent'
);

select ok(
  not has_schema_privilege('anon', 'public', 'USAGE')
    and not has_schema_privilege('anon', 'public', 'CREATE'),
  'anonymous has no effective public-schema privilege, including inherited PUBLIC grants'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.profiles',
      'public.households',
      'public.household_memberships',
      'public.meal_slots',
      'public.recipes',
      'public.recipe_ingredients',
      'public.meal_plan_entries',
      'public.pantry_items',
      'public.pantry_deductions',
      'public.shopping_lists',
      'public.shopping_list_items'
    ]) as shipped_table(name)
    where has_table_privilege('anon', name, 'SELECT')
      or has_table_privilege('anon', name, 'INSERT')
      or has_table_privilege('anon', name, 'UPDATE')
      or has_table_privilege('anon', name, 'DELETE')
      or has_table_privilege('authenticated', name, 'INSERT')
      or has_table_privilege('authenticated', name, 'UPDATE')
      or has_table_privilege('authenticated', name, 'DELETE')
  ),
  'effective table privileges expose no anonymous access or authenticated table-level mutation'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  'anonymous has no effective execution privilege on any public function'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_namespace namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) privilege
    where namespace.nspname = 'public' and privilege.grantee = 0
    union all
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(
        relation.relacl,
        acldefault(
          (case when relation.relkind = 'S' then 'S' else 'r' end)::"char",
          relation.relowner
        )
      )
    ) privilege
    where namespace.nspname = 'public' and privilege.grantee = 0
    union all
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where namespace.nspname = 'public' and privilege.grantee = 0
  ),
  'PUBLIC has no explicit or default effective ACL on the shipped public schema objects'
);

select * from finish();
rollback;
