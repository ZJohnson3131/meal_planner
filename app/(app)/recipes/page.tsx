import { adoptCuratedRecipe } from "@/app/actions/curated-recipes";
import { CuratedDinnerCatalog } from "@/components/recipes/curated-dinner-catalog";
import Link from "next/link";

import { RecipeList } from "@/components/recipes/recipe-list";
import { requireHousehold } from "@/lib/auth/household";
import { getCuratedDinnerCatalog } from "@/lib/curated-recipes/catalog";
import { createClient } from "@/lib/supabase/server";

export default async function RecipesPage() {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const [recipesResult, curatedRecipes] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, title, favorite, source_url, description, servings, ingestion_status")
      .eq("household_id", householdId)
      .order("favorite", { ascending: false })
      .order("title", { ascending: true }),
    getCuratedDinnerCatalog(),
  ]);

  if (recipesResult.error) throw new Error("Failed to load recipes");

  async function addCuratedDinner(curatedRecipeId: string) {
    "use server";

    const formData = new FormData();
    formData.set("curatedRecipeId", curatedRecipeId);
    return adoptCuratedRecipe(formData);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Recipes</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Save recipes manually or import details from a recipe URL, then review them before planning dinner.
          </p>
        </div>
        <Link className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800" href="/recipes/new">
          Add recipe
        </Link>
      </div>
      <RecipeList recipes={recipesResult.data ?? []} />
      <CuratedDinnerCatalog
        adoptRecipe={addCuratedDinner}
        recipes={curatedRecipes.map((recipe) => ({
          id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          servings: recipe.servings,
          tags: recipe.tags,
          sourceName: recipe.collection.sourceName,
          sourceUrl: recipe.sourceUrl,
          licenseName: recipe.collection.licenseName,
          licenseUrl: recipe.collection.licenseUrl,
          adoptedRecipeId: recipe.adoptedRecipeId,
        }))}
      />
    </div>
  );
}
