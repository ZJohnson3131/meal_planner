import "server-only";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

export type CuratedRecipeTag = {
  slug: string;
  label: string;
  category: "course" | "cuisine" | "protein" | "method" | "dietary";
};

export type CuratedDinnerCatalogRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sourceUrl: string;
  servings: number | null;
  instructions: string;
  collection: {
    slug: string;
    name: string;
    description: string | null;
    sourceName: string;
    sourceUrl: string;
    licenseName: string;
    licenseUrl: string;
  };
  tags: CuratedRecipeTag[];
  adoptedRecipeId: string | null;
};

/**
 * Loads only the published, globally curated dinner catalogue for the active
 * authenticated household.  The separate adoption query is deliberately
 * scoped to that household so a catalogue card never treats another
 * household's copy as this household's adopted recipe.
 */
export async function getCuratedDinnerCatalog(): Promise<CuratedDinnerCatalogRecipe[]> {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();

  const [recipesResult, adoptionsResult] = await Promise.all([
    supabase
      .from("curated_recipes")
      .select(
        "id,slug,title,description,source_url,servings,instructions,collection:curated_recipe_collections!inner(slug,name,description,source_name,source_url,license_name,license_url),tags:curated_recipe_tags(curated_tags(slug,label,category))",
      )
      .eq("published", true)
      .eq("collection.published", true)
      .order("title", { ascending: true }),
    supabase
      .from("curated_recipe_adoptions")
      .select("curated_recipe_id,recipe_id")
      .eq("household_id", householdId),
  ]);

  if (recipesResult.error || adoptionsResult.error) {
    throw new Error("We could not load the dinner library. Refresh and try again.");
  }

  const adoptedRecipeIds = new Map(
    (adoptionsResult.data ?? []).map((adoption) => [adoption.curated_recipe_id, adoption.recipe_id]),
  );

  return (recipesResult.data ?? []).map((recipe) => ({
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    sourceUrl: recipe.source_url,
    servings: recipe.servings,
    instructions: recipe.instructions,
    collection: {
      slug: recipe.collection.slug,
      name: recipe.collection.name,
      description: recipe.collection.description,
      sourceName: recipe.collection.source_name,
      sourceUrl: recipe.collection.source_url,
      licenseName: recipe.collection.license_name,
      licenseUrl: recipe.collection.license_url,
    },
    tags: recipe.tags.flatMap((recipeTag) => {
      const tag = recipeTag.curated_tags;
      return tag
        ? [{ slug: tag.slug, label: tag.label, category: tag.category }]
        : [];
    }),
    adoptedRecipeId: adoptedRecipeIds.get(recipe.id) ?? null,
  }));
}
