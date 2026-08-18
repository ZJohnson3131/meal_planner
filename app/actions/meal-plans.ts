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
    .filter((deduction) => deduction.status !== "reversed")
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
  const { supabase, dinnerSlotId } = await getDefaultDinnerSlot(householdId);

  // Verify the recipe belongs to the active household before using it in an
  // upsert. This also produces a clear failure when a forged recipe ID is sent.
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", parsedInput.data.recipeId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (recipeError || !recipe) {
    throw new Error("Recipe not found in the current household");
  }

  // Completion is coupled to the pantry-deduction ledger in Task 15. Do not
  // allow a dinner assignment to silently replace a completed entry.
  const { data: existingEntry, error: existingEntryError } = await supabase
    .from("meal_plan_entries")
    .select("status")
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .eq("planned_for", parsedInput.data.plannedFor)
    .maybeSingle();
  if (existingEntryError) {
    throw new Error("Failed to load the existing dinner plan");
  }
  if (existingEntry?.status === "completed") {
    throw new Error("A completed meal must be reversed before it can be changed");
  }

  const { error } = await supabase.from("meal_plan_entries").upsert(
    {
      household_id: householdId,
      meal_slot_id: dinnerSlotId,
      recipe_id: recipe.id,
      planned_for: parsedInput.data.plannedFor,
      status: "planned",
    },
    { onConflict: "household_id,meal_slot_id,planned_for" },
  );
  if (error) {
    throw new Error("Failed to assign dinner");
  }

  revalidatePath("/planner");
  revalidatePath("/shopping");
}

async function updateDinnerStatus(formData: FormData, status: "planned" | "skipped") {
  const parsedEntryId = mealPlanEntryIdSchema.safeParse(formData.get("entryId"));
  if (!parsedEntryId.success) {
    throw new Error("Meal plan entry identifier is invalid");
  }

  const { householdId } = await requireHousehold();
  const { supabase, dinnerSlotId } = await getDefaultDinnerSlot(householdId);
  const { data: entry, error: entryError } = await supabase
    .from("meal_plan_entries")
    .select("id,status")
    .eq("id", parsedEntryId.data)
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .maybeSingle();

  if (entryError || !entry) {
    throw new Error("Meal plan entry not found in the current household");
  }
  if (entry.status === "completed") {
    throw new Error("A completed meal must be reversed before its status can change");
  }
  if (status === "planned" && entry.status !== "skipped") {
    throw new Error("Only skipped meals can be restored to planned");
  }

  const { data: updatedEntry, error: updateError } = await supabase
    .from("meal_plan_entries")
    .update({ status })
    .eq("id", entry.id)
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedEntry) {
    throw new Error("Failed to update meal plan status");
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

/**
 * Applies the conservative deduction plan for a planned Dinner and records
 * every ingredient in the ledger. Calling this after a successful completion
 * is intentionally a no-op, which protects against duplicate form submits.
 */
export async function completeMeal(formData: FormData) {
  const parsedEntryId = mealPlanEntryIdSchema.safeParse(formData.get("entryId"));
  if (!parsedEntryId.success) {
    throw new Error("Meal plan entry identifier is invalid");
  }

  const { householdId } = await requireHousehold();
  const { supabase, entry } = await getDinnerEntry(parsedEntryId.data, householdId);

  if (entry.status === "completed") {
    return;
  }
  if (entry.status !== "planned") {
    throw new Error("Only planned dinners can be completed");
  }

  const plan = await loadDeductionPlan(entry, householdId);
  const { error: completionError } = await supabase.rpc("apply_meal_completion_deductions", {
    p_entry_id: entry.id,
    p_deductions: plan.map((item) => ({
      recipeIngredientId: item.recipeIngredientId,
      pantryItemId: item.pantryItemId,
      itemName: item.itemName,
      // The ledger is deliberately complete, including items that cannot be
      // safely deducted. Preserve that review record with explicit sentinel
      // values when the source recipe omitted a quantity or unit.
      quantity: item.quantity ?? 0,
      unit: item.unit ?? "unknown",
      status: item.reviewRequired ? "review_required" : "applied",
    })),
  });
  if (completionError) throw new Error("Failed to mark meal completed");

  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
}

/**
 * Restores the exact quantities recorded in applied deductions. Review rows
 * never changed pantry stock, so they are only marked reversed. Missing pantry
 * records are tolerated: there is no safe item to restore in that case.
 */
export async function reverseCompletedMeal(formData: FormData) {
  const parsedInput = reversalSchema.safeParse({
    entryId: formData.get("entryId"),
    confirmReversal: formData.get("confirmReversal"),
  });
  if (!parsedInput.success) {
    throw new Error("Confirm reversal before restoring a completed meal");
  }

  const { householdId } = await requireHousehold();
  const { supabase, entry } = await getDinnerEntry(parsedInput.data.entryId, householdId);
  if (entry.status !== "completed") {
    throw new Error("Only completed dinners can be reversed");
  }

  const { error: reversalError } = await supabase.rpc("reverse_meal_completion_deductions", {
    p_entry_id: entry.id,
  });
  if (reversalError) throw new Error("Failed to restore the meal to planned");

  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
}
