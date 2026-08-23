-- The hardened default privileges remove automatic grants for tables created
-- after 0005. service_role bypasses RLS but still needs table privileges for
-- the privileged catalogue maintenance path and local security fixtures.
-- Household clients remain read-only through the explicit authenticated grant
-- in 0007; this migration grants no privileges to anon or authenticated.

grant select, insert, update, delete on table public.curated_recipe_collections,
  public.curated_recipes, public.curated_recipe_ingredients, public.curated_tags,
  public.curated_recipe_tags, public.curated_recipe_adoptions to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.curated_recipe_collections', 'public.curated_recipes',
    'public.curated_recipe_ingredients', 'public.curated_tags',
    'public.curated_recipe_tags', 'public.curated_recipe_adoptions'
  ] loop
    if not has_table_privilege('service_role', v_table, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'service role administrative privilege missing on %', v_table;
    end if;
  end loop;
end;
$$;
