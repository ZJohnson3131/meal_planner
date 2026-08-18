"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";
import { recipeSchema } from "@/lib/validation/recipes";

const ingestionStatusSchema = z.enum(["manual", "parsed", "needs_review", "failed"]);

function nullableText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function formDataToRecipeInput(formData: FormData) {
  const ingredientNames = formData.getAll("ingredientName");
  const quantities = formData.getAll("ingredientQuantity");
  const units = formData.getAll("ingredientUnit");
  const notes = formData.getAll("ingredientNotes");

  return recipeSchema.safeParse({
    title: formData.get("title"),
    description: nullableText(formData.get("description")),
    sourceUrl: nullableText(formData.get("sourceUrl")),
    favorite: formData.get("favorite") === "on",
    servings: nullableText(formData.get("servings")),
    instructions: formData.get("instructions"),
    ingredients: ingredientNames
      .map((itemName, index) => ({
        itemName,
        quantity: nullableText(quantities[index] ?? null),
        unit: nullableText(units[index] ?? null),
        notes: nullableText(notes[index] ?? null),
      }))
      .filter((ingredient) => typeof ingredient.itemName === "string" && ingredient.itemName.trim().length > 0),
  });
}

/** Creates a recipe only within the authenticated user's active household. */
export async function createRecipe(formData: FormData) {
  const parsedRecipe = formDataToRecipeInput(formData);
  if (!parsedRecipe.success) {
    throw new Error("Recipe details are invalid");
  }

  const parsedStatus = ingestionStatusSchema.safeParse(formData.get("ingestionStatus") ?? "manual");
  if (!parsedStatus.success) {
    throw new Error("Recipe ingestion status is invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const recipeInput = parsedRecipe.data;

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      household_id: householdId,
      title: recipeInput.title,
      description: recipeInput.description ?? null,
      source_url: recipeInput.sourceUrl ?? null,
      favorite: recipeInput.favorite,
      servings: recipeInput.servings ?? null,
      instructions: recipeInput.instructions,
      ingestion_status: parsedStatus.data,
    })
    .select("id")
    .single();

  if (error || !recipe) {
    throw new Error("Failed to create recipe");
  }

  const ingredients = recipeInput.ingredients.map((ingredient, displayOrder) => ({
    recipe_id: recipe.id,
    item_name: ingredient.itemName,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    notes: ingredient.notes ?? null,
    display_order: displayOrder,
  }));

  const { error: ingredientError } = await supabase
    .from("recipe_ingredients")
    .insert(ingredients);
  if (ingredientError) {
    // Supabase's REST insert cannot span these two tables as one transaction.
    // Best-effort cleanup avoids leaving a partial recipe behind on an ingredient failure.
    await supabase.from("recipes").delete().eq("id", recipe.id).eq("household_id", householdId);
    throw new Error("Failed to create recipe ingredients");
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
}
