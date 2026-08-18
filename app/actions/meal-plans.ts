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

  return buildDeductionPlan({
    mealPlanEntryId: entry.id,
    existingDeductions,
    ingredients: (ingredientsResult.data ?? []).map((ingredient) => ({
      id: ingredient.id,
      itemName: ingredient.item_name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
    pantry: (pantryResult.data ?? []).map((item) => ({
      id: item.id,
      itemName: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  });
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
    clean: plan.filter((item) => !item.reviewRequired),
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
  const { supabase, dinnerSlotId, entry } = await getDinnerEntry(parsedEntryId.data, householdId);

  if (entry.status === "completed") {
    return;
  }
  if (entry.status !== "planned") {
    throw new Error("Only planned dinners can be completed");
  }

  const plan = await loadDeductionPlan(entry, householdId);
  const cleanDeductions = plan.filter(
    (item) => !item.reviewRequired && item.pantryItemId !== null && item.quantity !== null,
  );

  // Multiple recipe lines can point to the same pantry item. Combine them
  // before applying changes so quantity checks remain safe and deterministic.
  const cleanTotals = new Map<string, number>();
  for (const deduction of cleanDeductions) {
    const pantryItemId = deduction.pantryItemId;
    if (!pantryItemId) continue;
    cleanTotals.set(pantryItemId, (cleanTotals.get(pantryItemId) ?? 0) + (deduction.quantity ?? 0));
  }

  if (cleanTotals.size > 0) {
    const { data: pantryItems, error: pantryError } = await supabase
      .from("pantry_items")
      .select("id,quantity")
      .eq("household_id", householdId)
      .in("id", [...cleanTotals.keys()]);
    if (pantryError || !pantryItems || pantryItems.length !== cleanTotals.size) {
      throw new Error("Pantry stock changed before this meal could be completed");
    }

    // The equality filter is optimistic concurrency protection: a parallel
    // pantry edit causes the action to fail rather than silently overwriting it.
    for (const pantryItem of pantryItems) {
      const quantityToDeduct = cleanTotals.get(pantryItem.id) ?? 0;
      if (pantryItem.quantity < quantityToDeduct) {
        throw new Error("Pantry stock changed before this meal could be completed");
      }
      const { data: updatedItem, error: updateError } = await supabase
        .from("pantry_items")
        .update({ quantity: pantryItem.quantity - quantityToDeduct })
        .eq("id", pantryItem.id)
        .eq("household_id", householdId)
        .eq("quantity", pantryItem.quantity)
        .select("id")
        .maybeSingle();
      if (updateError || !updatedItem) {
        throw new Error("Pantry stock changed before this meal could be completed");
      }
    }
  }

  if (plan.length > 0) {
    const { error: deductionError } = await supabase.from("pantry_deductions").upsert(
      plan.map((item) => ({
        household_id: householdId,
        meal_plan_entry_id: entry.id,
        pantry_item_id: item.pantryItemId,
        recipe_ingredient_id: item.recipeIngredientId,
        item_name: item.itemName,
        // The database ledger requires values even for incomplete recipe data.
        // A review row is never applied to pantry stock, and records zero plus
        // "unknown" only when the source value itself is unavailable.
        quantity: item.quantity ?? 0,
        unit: item.unit ?? "unknown",
        status: item.reviewRequired ? "review_required" : "applied",
        reversed_at: null,
      })),
      { onConflict: "meal_plan_entry_id,recipe_ingredient_id" },
    );
    if (deductionError) {
      throw new Error("Failed to record pantry deductions");
    }
  }

  const { data: completedEntry, error: completionError } = await supabase
    .from("meal_plan_entries")
    .update({ status: "completed" })
    .eq("id", entry.id)
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .eq("status", "planned")
    .select("id")
    .maybeSingle();
  if (completionError || !completedEntry) {
    throw new Error("Failed to mark meal completed");
  }

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
  const { supabase, dinnerSlotId, entry } = await getDinnerEntry(parsedInput.data.entryId, householdId);
  if (entry.status !== "completed") {
    throw new Error("Only completed dinners can be reversed");
  }

  const { data: deductions, error: deductionsError } = await supabase
    .from("pantry_deductions")
    .select("id,pantry_item_id,quantity,status")
    .eq("household_id", householdId)
    .eq("meal_plan_entry_id", entry.id)
    .in("status", ["applied", "review_required"]);
  if (deductionsError) {
    throw new Error("Failed to load pantry deductions for reversal");
  }

  const appliedTotals = new Map<string, number>();
  for (const deduction of deductions ?? []) {
    if (deduction.status !== "applied" || !deduction.pantry_item_id) continue;
    appliedTotals.set(
      deduction.pantry_item_id,
      (appliedTotals.get(deduction.pantry_item_id) ?? 0) + deduction.quantity,
    );
  }

  if (appliedTotals.size > 0) {
    const { data: pantryItems, error: pantryError } = await supabase
      .from("pantry_items")
      .select("id,quantity")
      .eq("household_id", householdId)
      .in("id", [...appliedTotals.keys()]);
    if (pantryError) {
      throw new Error("Failed to restore pantry stock");
    }

    // A deleted pantry item cannot be restored safely. Restore all remaining
    // household-owned items from the exact quantities stored in the ledger.
    for (const pantryItem of pantryItems ?? []) {
      const { data: updatedItem, error: updateError } = await supabase
        .from("pantry_items")
        .update({ quantity: pantryItem.quantity + (appliedTotals.get(pantryItem.id) ?? 0) })
        .eq("id", pantryItem.id)
        .eq("household_id", householdId)
        .eq("quantity", pantryItem.quantity)
        .select("id")
        .maybeSingle();
      if (updateError || !updatedItem) {
        throw new Error("Pantry stock changed before this meal could be reversed");
      }
    }
  }

  const deductionIds = (deductions ?? []).map((deduction) => deduction.id);
  if (deductionIds.length > 0) {
    const { error: reversalError } = await supabase
      .from("pantry_deductions")
      .update({ status: "reversed", reversed_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("meal_plan_entry_id", entry.id)
      .in("id", deductionIds);
    if (reversalError) {
      throw new Error("Failed to record pantry deduction reversal");
    }
  }

  const { data: restoredEntry, error: entryError } = await supabase
    .from("meal_plan_entries")
    .update({ status: "planned" })
    .eq("id", entry.id)
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotId)
    .eq("status", "completed")
    .select("id")
    .maybeSingle();
  if (entryError || !restoredEntry) {
    throw new Error("Failed to restore the meal to planned");
  }

  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
}
