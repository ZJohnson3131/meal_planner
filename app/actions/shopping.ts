"use server";

import { revalidatePath } from "next/cache";

import { requireHousehold } from "@/lib/auth/household";
import { aggregateIngredients } from "@/lib/domain/ingredient-aggregation";
import { calculatePantryDelta } from "@/lib/domain/pantry-delta";
import { createClient } from "@/lib/supabase/server";
import { shoppingListRangeSchema } from "@/lib/validation/shopping";

/**
 * Generates a household-owned snapshot from planned Dinner entries. A new
 * list is intentionally created on every request so prior lists remain an
 * accurate record of the pantry/planning state at the time they were made.
 */
export async function generateShoppingList(formData: FormData) {
  const { householdId } = await requireHousehold();
  const parsedRange = shoppingListRangeSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsedRange.success) {
    throw new Error("Shopping-list dates are invalid");
  }

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

  const { data: shoppingList, error: shoppingListError } = await supabase
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      name: `Shopping list ${parsedRange.data.startDate} to ${parsedRange.data.endDate}`,
      start_date: parsedRange.data.startDate,
      end_date: parsedRange.data.endDate,
      status: "active",
    })
    .select("id")
    .single();
  if (shoppingListError || !shoppingList) {
    throw new Error("Failed to create shopping list");
  }

  if (deltas.length > 0) {
    const { error: itemsError } = await supabase.from("shopping_list_items").insert(
      deltas.map((delta) => ({
        shopping_list_id: shoppingList.id,
        item_name: delta.itemName,
        required_quantity: delta.requiredQuantity,
        pantry_quantity: delta.pantryQuantity,
        delta_quantity: delta.deltaQuantity,
        unit: delta.unit,
        status: "needed",
        review_required: delta.reviewRequired,
        review_reason: delta.reviewReason,
      })),
    );
    if (itemsError) {
      throw new Error("Failed to save shopping-list items");
    }
  }

  revalidatePath("/shopping");
}
