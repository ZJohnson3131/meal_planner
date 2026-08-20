import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { updateRecipe } from "@/app/actions/recipes";
import { RecipeForm } from "@/components/forms/recipe-form";
import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

const recipeIdSchema = z.string().uuid();

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = recipeIdSchema.safeParse(id);
  if (!recipeId.success) notFound();

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("id, title, source_url, favorite, servings, instructions, ingestion_status, recipe_ingredients(id, item_name, quantity, unit, notes, display_order)")
    .eq("id", recipeId.data)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error("Failed to load recipe");
  if (!recipe) notFound();

  const ingredients = [...(recipe.recipe_ingredients ?? [])]
    .sort((first, second) => first.display_order - second.display_order)
    .map((ingredient) => ({
      id: ingredient.id,
      itemName: ingredient.item_name,
      notes: ingredient.notes ?? "",
      quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
      unit: ingredient.unit ?? "",
    }));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link className="text-sm font-medium text-emerald-700 hover:underline" href={`/recipes/${recipe.id}`}>← Recipe details</Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Edit recipe</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Update the recipe details and ingredients used for future planning.</p>
        </div>
      </div>
      <RecipeForm
        initialRecipe={{
          title: recipe.title,
          sourceUrl: recipe.source_url ?? "",
          favorite: recipe.favorite,
          servings: recipe.servings === null ? "" : String(recipe.servings),
          instructions: recipe.instructions,
          ingestionStatus: recipe.ingestion_status,
          ingredients,
        }}
        submitAction={updateRecipe.bind(null, recipe.id)}
      />
    </div>
  );
}
