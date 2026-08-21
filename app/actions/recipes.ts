"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { RECIPE_IMPORT_LIMITS } from "@/lib/recipes/recipe-import-contract";
import { createClient } from "@/lib/supabase/server";
import { recipeSchema } from "@/lib/validation/recipes";

const ingestionStatusSchema = z.enum(["manual", "parsed", "needs_review", "failed"]);
const recipeIdSchema = z.string().uuid();
const recipeActionSchema = recipeSchema.extend({
  ingredients: recipeSchema.shape.ingredients.element
    .extend({ id: z.string().uuid().nullable().optional() })
    .array()
    .min(1)
    .max(RECIPE_IMPORT_LIMITS.ingredients),
});

function nullableText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function formDataToRecipeInput(formData: FormData) {
  const ingredientNames = formData.getAll("ingredientName");
  const quantities = formData.getAll("ingredientQuantity");
  const units = formData.getAll("ingredientUnit");
  const notes = formData.getAll("ingredientNotes");
  const ids = formData.getAll("ingredientId");

  return recipeActionSchema.safeParse({
    title: formData.get("title"),
    description: nullableText(formData.get("description")),
    sourceUrl: nullableText(formData.get("sourceUrl")),
    favorite: formData.get("favorite") === "on",
    servings: nullableText(formData.get("servings")),
    instructions: formData.get("instructions"),
    ingredients: ingredientNames
      .map((itemName, index) => ({
        id: nullableText(ids[index] ?? null),
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

  const { data, error } = await supabase.rpc("create_recipe_with_ingredients", {
    p_household_id: householdId,
    p_ingredients: recipeInput.ingredients.map(({ itemName, notes, quantity, unit }) => ({
      itemName,
      notes: notes ?? null,
      quantity,
      unit,
    })),
    p_recipe: {
      description: recipeInput.description ?? null,
      favorite: recipeInput.favorite,
      ingestionStatus: parsedStatus.data,
      instructions: recipeInput.instructions,
      servings: recipeInput.servings ?? null,
      sourceUrl: recipeInput.sourceUrl ?? null,
      title: recipeInput.title,
    },
  });
  const createdRecipeId = recipeIdSchema.safeParse(data);
  if (error || !createdRecipeId.success) {
    throw new Error("We could not create this recipe. Check the details and try again.");
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${createdRecipeId.data}`);
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
    .select("id, description")
    .eq("id", parsedId.data)
    .eq("household_id", householdId)
    .maybeSingle();

  if (existingError || !existingRecipe) {
    throw new Error("We could not load this recipe. Refresh the page and try again.");
  }

  const recipeInput = parsedRecipe.data;
  const { error: updateError } = await supabase.rpc("update_recipe_with_ingredients", {
    p_ingredients: recipeInput.ingredients.map(({ id, itemName, notes, quantity, unit }) => ({
      id: id ?? null,
      itemName,
      notes: notes ?? null,
      quantity,
      unit,
    })),
    p_recipe_id: existingRecipe.id,
    p_recipe: {
      description: formData.has("description")
        ? recipeInput.description ?? null
        : existingRecipe.description,
      favorite: recipeInput.favorite,
      ingestionStatus: parsedStatus.data,
      instructions: recipeInput.instructions,
      servings: recipeInput.servings ?? null,
      sourceUrl: recipeInput.sourceUrl ?? null,
      title: recipeInput.title,
    },
  });

  if (updateError) {
    throw new Error("We could not update this recipe. Refresh the page and try again.");
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${existingRecipe.id}`);
  redirect(`/recipes/${existingRecipe.id}`);
}
