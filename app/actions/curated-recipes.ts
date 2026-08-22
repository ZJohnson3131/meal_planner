"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

const curatedRecipeIdSchema = z.string().uuid();

export type AdoptCuratedRecipeResult = {
  recipeId: string;
};

/**
 * Copies one published library recipe into the current household through the
 * database's authorization-enforcing, idempotent RPC.  The returned recipe
 * ID is the household-owned copy and is safe for the UI to link to or plan.
 */
export async function adoptCuratedRecipe(formData: FormData): Promise<AdoptCuratedRecipeResult> {
  const parsedRecipeId = curatedRecipeIdSchema.safeParse(formData.get("curatedRecipeId"));
  if (!parsedRecipeId.success) {
    throw new Error("Dinner library recipe identifier is invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adopt_curated_recipe", {
    p_household_id: householdId,
    p_curated_recipe_id: parsedRecipeId.data,
  });
  const recipeId = curatedRecipeIdSchema.safeParse(data);
  if (error || !recipeId.success) {
    throw new Error("We could not add that dinner to your recipes. Refresh and try again.");
  }

  revalidatePath("/recipes");
  revalidatePath("/planner");

  return { recipeId: recipeId.data };
}
