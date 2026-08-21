"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { buildDeductionPlan, type DeductionPlanItem } from "@/lib/domain/pantry-deductions";
import { createClient } from "@/lib/supabase/server";

const assignDinnerSchema = z.object({
  plannedFor: z.string().date(),
  recipeId: z.string().uuid(),
});

const mealPlanEntryIdSchema = z.string().uuid();
const reversalSchema = z.object({
  entryId: z.string().uuid(),
  confirmReversal: z.literal("true"),
});

type DinnerMealEntry = {
  id: string;
  recipe_id: string;
  status: "planned" | "completed" | "skipped";
};

/**
 * Finds the active household's seeded dinner slot. Keeping the slot lookup in
 * every mutation makes the dinner-only MVP explicit while preserving the
 * underlying multi-slot model for later expansion.
 */
async function getDefaultDinnerSlot(householdId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_slots")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", "Dinner")
    .eq("is_default", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No default Dinner slot found for the current household");
  }

  return { supabase, dinnerSlotId: data.id };
}

/**
 * Loads a Dinner entry only when it belongs to the active household. This is
 * deliberately shared by the completion read, mutation, and reversal paths
 * so a forged entry ID cannot operate on another household (or another slot).
 */
async function getDinnerEntry(entryId: string, householdId: string) {
  const { supabase, dinnerSlotId } = await getDefaultDinnerSlot(householdId);
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id,recipe_id,status")
    .eq("id", entryId)
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Meal plan entry not found in the current household");
  }

  return { supabase, dinnerSlotId, entry: data as DinnerMealEntry };
}

async function loadDeductionPlan(entry: DinnerMealEntry, householdId: string) {
  const supabase = await createClient();
  const [ingredientsResult, pantryResult, deductionsResult] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("id,item_name,quantity,unit")
      .eq("recipe_id", entry.recipe_id),
    supabase
      .from("pantry_items")
      .select("id,item_name,quantity,unit")
      .eq("household_id", householdId),
    supabase
      .from("pantry_deductions")
      .select("recipe_ingredient_id,status")
      .eq("household_id", householdId)
      .eq("meal_plan_entry_id", entry.id),
  ]);

  if (ingredientsResult.error || pantryResult.error || deductionsResult.error) {
    throw new Error("Failed to load meal completion details");
  }

  // Reversed rows are historical ledger records, not active deductions. They
  // must be eligible to apply again if the meal is completed a second time.
  const existingDeductions = (deductionsResult.data ?? [])
    .filter(
      (deduction): deduction is typeof deduction & { recipe_ingredient_id: string } =>
        deduction.status !== "reversed" && deduction.recipe_ingredient_id !== null,
    )
    .map((deduction) => ({ recipeIngredientId: deduction.recipe_ingredient_id }));

  const pantry = (pantryResult.data ?? []).map((item) => ({
    id: item.id,
    itemName: item.item_name,
    quantity: item.quantity,
    unit: item.unit,
  }));
  const plan = buildDeductionPlan({
    mealPlanEntryId: entry.id,
    existingDeductions,
    ingredients: (ingredientsResult.data ?? []).map((ingredient) => ({
      id: ingredient.id,
      itemName: ingredient.item_name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
    pantry,
  });

  // `buildDeductionPlan` evaluates a recipe line against a pantry item. A
  // recipe can contain multiple lines that match the same pantry item, so
  // reconcile those lines as a group before either previewing or applying
  // them. Otherwise two individually-safe lines could overdraw one item.
  const pantryQuantityById = new Map(pantry.map((item) => [item.id, item.quantity]));
  const requestedByPantryItem = new Map<string, number>();
  for (const item of plan) {
    if (item.reviewRequired || !item.pantryItemId || item.quantity === null) continue;
    requestedByPantryItem.set(
      item.pantryItemId,
      (requestedByPantryItem.get(item.pantryItemId) ?? 0) + item.quantity,
    );
  }

  return plan.map((item) => {
    if (item.reviewRequired || !item.pantryItemId || item.quantity === null) return item;
    const available = pantryQuantityById.get(item.pantryItemId);
    const requested = requestedByPantryItem.get(item.pantryItemId) ?? 0;
    if (available === undefined || requested <= available) return item;

    return {
      ...item,
      reviewRequired: true,
      reviewReason: "Insufficient pantry stock",
    };
  });
}

function aggregatePreviewDeductions(items: DeductionPlanItem[]) {
  const grouped = new Map<string, DeductionPlanItem>();
  for (const item of items) {
    // Clean deductions always have a matched pantry item and a converted
    // quantity. Keep the fallback key defensive for future callers.
    const key = item.pantryItemId ?? item.recipeIngredientId;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item });
      continue;
    }

    grouped.set(key, {
      ...existing,
      quantity: (existing.quantity ?? 0) + (item.quantity ?? 0),
    });
  }
  return [...grouped.values()];
}

/**
 * Returns the serializable clean and review-required changes for a planned
 * Dinner. The dialog uses this before asking the user to complete the meal.
 */
export async function getMealCompletionPreview(entryId: string): Promise<{
  clean: DeductionPlanItem[];
  review: DeductionPlanItem[];
}> {
  const parsedEntryId = mealPlanEntryIdSchema.safeParse(entryId);
  if (!parsedEntryId.success) {
    throw new Error("Meal plan entry identifier is invalid");
  }

  const { householdId } = await requireHousehold();
  const { entry } = await getDinnerEntry(parsedEntryId.data, householdId);
  if (entry.status !== "planned") {
    throw new Error("Only planned dinners can be completed");
  }

  const plan = await loadDeductionPlan(entry, householdId);
  return {
    clean: aggregatePreviewDeductions(plan.filter((item) => !item.reviewRequired)),
    review: plan.filter((item) => item.reviewRequired),
  };
}

/** Assigns (or replaces) the household's Dinner recipe for one calendar day. */
export async function assignDinner(formData: FormData) {
  const parsedInput = assignDinnerSchema.safeParse({
    plannedFor: formData.get("plannedFor"),
    recipeId: formData.get("recipeId"),
  });
  if (!parsedInput.success) {
    throw new Error("Dinner assignment details are invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_dinner", {
    p_household_id: householdId,
    p_planned_for: parsedInput.data.plannedFor,
    p_recipe_id: parsedInput.data.recipeId,
  });
  if (error) {
    throw new Error("We could not assign that dinner. Refresh the planner and try again.");
  }

  revalidatePath("/planner");
  revalidatePath("/shopping");
}

async function updateDinnerStatus(formData: FormData, status: "planned" | "skipped") {
  const parsedEntryId = mealPlanEntryIdSchema.safeParse(formData.get("entryId"));
  if (!parsedEntryId.success) {
    throw new Error("Meal plan entry identifier is invalid");
  }

  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_dinner_status", {
    p_entry_id: parsedEntryId.data,
    p_target_status: status,
  });
  if (error) {
    throw new Error("We could not update that dinner. Refresh the planner and try again.");
  }

  revalidatePath("/planner");
  revalidatePath("/shopping");
}

/** Marks an assigned dinner as skipped without removing its scheduling record. */
export async function markMealSkipped(formData: FormData) {
  await updateDinnerStatus(formData, "skipped");
}

/** Restores a skipped dinner to the planned state. */
export async function markMealPlanned(formData: FormData) {
  await updateDinnerStatus(formData, "planned");
}

/** Completes a Dinner using the database-derived, locked deduction plan. */
export async function completeMeal(formData: FormData) {
  const parsedEntryId = mealPlanEntryIdSchema.safeParse(formData.get("entryId"));
  if (!parsedEntryId.success) {
    throw new Error("Meal plan entry identifier is invalid");
  }

  await requireHousehold();
  const supabase = await createClient();
  const { error: completionError } = await supabase.rpc("complete_meal_plan_entry", {
    p_entry_id: parsedEntryId.data,
  });
  if (completionError) {
    throw new Error("We could not complete that meal. Refresh the planner and try again.");
  }

  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
}

/** Restores the exact locked ledger quantities after explicit confirmation. */
export async function reverseCompletedMeal(formData: FormData) {
  const parsedInput = reversalSchema.safeParse({
    entryId: formData.get("entryId"),
    confirmReversal: formData.get("confirmReversal"),
  });
  if (!parsedInput.success) {
    throw new Error("Confirm reversal before restoring a completed meal");
  }

  await requireHousehold();
  const supabase = await createClient();
  const { error: reversalError } = await supabase.rpc("reverse_meal_completion_deductions", {
    p_entry_id: parsedInput.data.entryId,
  });
  if (reversalError) {
    throw new Error("We could not reverse that meal. Refresh the planner and try again.");
  }

  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
}
