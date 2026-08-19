"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";
import { recipeSchema } from "@/lib/validation/recipes";

const ingestionStatusSchema = z.enum(["manual", "parsed", "needs_review", "failed"]);
const recipeIdSchema = z.string().uuid();

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

/**
 * Replaces a household recipe's editable fields and ingredients. The recipe is
 * checked against the active household before any mutation; RLS remains the
 * second authorization boundary.
 */
export async function updateRecipe(recipeId: string, formData: FormData) {
  const parsedId = recipeIdSchema.safeParse(recipeId);
  const parsedRecipe = formDataToRecipeInput(formData);
  const parsedStatus = ingestionStatusSchema.safeParse(formData.get("ingestionStatus") ?? "manual");

  if (!parsedId.success || !parsedRecipe.success || !parsedStatus.success) {
    throw new Error("Recipe details are invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data: existingRecipe, error: existingError } = await supabase
    .from("recipes")
    .select("id, title, description, source_url, favorite, servings, instructions, ingestion_status, recipe_ingredients(item_name, quantity, unit, notes, display_order)")
    .eq("id", parsedId.data)
    .eq("household_id", householdId)
    .maybeSingle();

  if (existingError) throw new Error("Failed to load recipe for update");
  if (!existingRecipe) throw new Error("Recipe not found");

  const recipe = existingRecipe;
  const recipeInput = parsedRecipe.data;
  const oldIngredients = recipe.recipe_ingredients ?? [];
  const replacementIngredients = recipeInput.ingredients.map((ingredient, displayOrder) => ({
    recipe_id: recipe.id,
    item_name: ingredient.itemName,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    notes: ingredient.notes ?? null,
    display_order: displayOrder,
  }));

  async function restoreIngredients() {
    const { error: deleteError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipe.id);
    if (deleteError) return deleteError;
    if (oldIngredients.length === 0) return null;

    const { error: insertError } = await supabase.from("recipe_ingredients").insert(
      oldIngredients.map((ingredient) => ({
        recipe_id: recipe.id,
        item_name: ingredient.item_name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        notes: ingredient.notes,
        display_order: ingredient.display_order,
      })),
    );
    return insertError;
  }

  const { error: deleteError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipe.id);
  if (deleteError) {
    throw new Error("Failed to replace recipe ingredients");
  }

  const { error: insertError } = await supabase.from("recipe_ingredients").insert(replacementIngredients);
  if (insertError) {
    const restoreError = await restoreIngredients();
    if (restoreError) throw new Error("Failed to update recipe ingredients and restore the original recipe");
    throw new Error("Failed to update recipe ingredients");
  }

  const { error: updateError } = await supabase
    .from("recipes")
    .update({
      title: recipeInput.title,
      // The current form does not expose a description field. Preserve it until
      // the form explicitly supplies one rather than wiping imported text.
      description: formData.has("description") ? recipeInput.description ?? null : recipe.description,
      source_url: recipeInput.sourceUrl ?? null,
      favorite: recipeInput.favorite,
      servings: recipeInput.servings ?? null,
      instructions: recipeInput.instructions,
      ingestion_status: parsedStatus.data,
    })
    .eq("id", recipe.id)
    .eq("household_id", householdId);

  if (updateError) {
    const restoreError = await restoreIngredients();
    if (restoreError) throw new Error("Failed to update recipe and restore the original ingredients");
    throw new Error("Failed to update recipe");
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipe.id}`);
  redirect(`/recipes/${recipe.id}`);
}
