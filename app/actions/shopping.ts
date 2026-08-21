"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireHousehold } from "@/lib/auth/household";
import { aggregateIngredients } from "@/lib/domain/ingredient-aggregation";
import { calculatePantryDelta } from "@/lib/domain/pantry-delta";
import { createClient } from "@/lib/supabase/server";
import {
  shoppingItemStatusInputSchema,
  shoppingListRangeSchema,
} from "@/lib/validation/shopping";

export type ShoppingItemFormState = {
  error: string | null;
  success: boolean;
  status?: "needed" | "checked" | "dismissed";
};

/**
 * Generates a household-owned snapshot from planned Dinner entries. A new
 * list is intentionally created on every request so prior lists remain an
 * accurate record of the pantry/planning state at the time they were made.
 */
export async function generateShoppingList(formData: FormData) {
  const parsedRange = shoppingListRangeSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsedRange.success) {
    throw new Error("Shopping-list dates are invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();

  // The MVP only plans dinners. Constraining the read to the household's
  // seeded slot prevents non-dinner entries from leaking into a list.
  const { data: dinnerSlot, error: dinnerSlotError } = await supabase
    .from("meal_slots")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", "Dinner")
    .eq("is_default", true)
    .maybeSingle();
  if (dinnerSlotError || !dinnerSlot) {
    throw new Error("No default Dinner slot found for the current household");
  }

  const [{ data: mealEntries, error: mealEntriesError }, { data: pantryItems, error: pantryError }] =
    await Promise.all([
      supabase
        .from("meal_plan_entries")
        .select("recipe_id")
        .eq("household_id", householdId)
        .eq("meal_slot_id", dinnerSlot.id)
        .eq("status", "planned")
        .gte("planned_for", parsedRange.data.startDate)
        .lte("planned_for", parsedRange.data.endDate),
      supabase
        .from("pantry_items")
        .select("id, item_name, quantity, unit")
        .eq("household_id", householdId),
    ]);

  if (mealEntriesError || pantryError) {
    throw new Error("Failed to load the meal plan or pantry for this shopping list");
  }

  const recipeIds = [...new Set((mealEntries ?? []).map((entry) => entry.recipe_id))];
  let ingredients: Array<{
    recipe_id: string;
    item_name: string;
    quantity: number | null;
    unit: string | null;
  }> = [];

  if (recipeIds.length > 0) {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, item_name, quantity, unit")
      .in("recipe_id", recipeIds);
    if (error) {
      throw new Error("Failed to load ingredients for the planned meals");
    }
    ingredients = data ?? [];
  }

  const ingredientsByRecipe = new Map<string, typeof ingredients>();
  for (const ingredient of ingredients) {
    const recipeIngredients = ingredientsByRecipe.get(ingredient.recipe_id) ?? [];
    recipeIngredients.push(ingredient);
    ingredientsByRecipe.set(ingredient.recipe_id, recipeIngredients);
  }

  // A recipe can be scheduled on more than one day. Expand ingredients by
  // entry (rather than recipe ID) so each planned dinner contributes once.
  const required = aggregateIngredients(
    (mealEntries ?? []).flatMap((entry) => ingredientsByRecipe.get(entry.recipe_id) ?? []).map((ingredient) => ({
      itemName: ingredient.item_name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
  );
  const deltas = calculatePantryDelta({
    required,
    pantry: (pantryItems ?? []).map((item) => ({
      id: item.id,
      itemName: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  });
  // A pantry surplus (or an exact match) does not belong on a shopping list.
  // Keep every review-required item, including items with an unknown delta, so
  // the user can resolve ambiguous units or quantities manually.
  const shoppingItems = deltas.filter(
    (delta) => delta.reviewRequired || (delta.deltaQuantity !== null && delta.deltaQuantity > 0),
  );

  const { error: shoppingListError } = await supabase.rpc(
    "create_shopping_list_with_items",
    {
      p_end_date: parsedRange.data.endDate,
      p_household_id: householdId,
      p_items: shoppingItems.map((delta) => ({
        deltaQuantity: delta.deltaQuantity,
        itemName: delta.itemName,
        pantryQuantity: delta.pantryQuantity,
        requiredQuantity: delta.requiredQuantity,
        reviewReason: delta.reviewReason,
        reviewRequired: delta.reviewRequired,
        unit: delta.unit,
      })),
      p_start_date: parsedRange.data.startDate,
    },
  );
  if (shoppingListError) {
    throw new Error("We could not generate this shopping list. Refresh the page and try again.");
  }

  revalidatePath("/shopping");
}

/** Persists one shopping-item status through the household-authorized RPC. */
export async function setShoppingItemStatus(
  _previousState: ShoppingItemFormState,
  formData: FormData,
): Promise<ShoppingItemFormState> {
  const parsedInput = shoppingItemStatusInputSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsedInput.success) {
    return { error: "The shopping item update was invalid.", success: false };
  }

  try {
    await requireHousehold();
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_shopping_item_status", {
      p_item_id: parsedInput.data.itemId,
      p_status: parsedInput.data.status,
    });
    if (error) throw error;

    revalidatePath("/shopping");
    return {
      error: null,
      status: parsedInput.data.status,
      success: true,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: "We could not save this shopping item. Refresh the list and try again.",
      success: false,
    };
  }
}
