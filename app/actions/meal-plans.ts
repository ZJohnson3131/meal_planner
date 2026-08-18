"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

const assignDinnerSchema = z.object({
  plannedFor: z.string().date(),
  recipeId: z.string().uuid(),
});

const mealPlanEntryIdSchema = z.string().uuid();

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
