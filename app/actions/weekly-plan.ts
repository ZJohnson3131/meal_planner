"use server";

import { revalidatePath } from "next/cache";

import { requireHousehold } from "@/lib/auth/household";
import { rankSavedRecipes, type RankableSavedRecipe } from "@/lib/domain/weekly-plan-ranking";
import { normalizeSupportedUnit, type SupportedCookingUnit } from "@/lib/domain/units";
import type {
  GeneratedRecipeDraft,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
} from "@/lib/domain/weekly-plan-types";
import {
  confirmWeeklyPlanSchema,
  generatedDraftListSchema,
  weeklyPlanPreferencesSchema,
  supportedUnitPromptVocabulary,
} from "@/lib/validation/weekly-plan";
import { createClient } from "@/lib/supabase/server";
import { generateWithOllama, getOllamaReadiness, OllamaGenerationError } from "@/lib/ollama/client";

export type {
  GeneratedRecipeDraft,
  WeeklyPlanPreferences,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
} from "@/lib/domain/weekly-plan-types";

type SavedRecipeRecord = RankableSavedRecipe & {
  servings: number | null;
  instructions: string;
  ingredients: Array<{ itemName: string; quantity: number | null; unit: SupportedCookingUnit | null; notes: string | null }>;
};

function weekDates(weekStart: string, count: number): string[] {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function buildPrompt(input: {
  householdSize: number;
  missingSlots: number;
  goals: string[];
  maxCookingMinutes: number | null | undefined;
  dietaryExclusions: string[];
  likesDislikes: string | null | undefined;
  selectedRecipes: string[];
  pantryNames: string[];
}): string {
  return [
    "Return JSON only, with exactly this shape: {\"drafts\":[{\"title\":string,\"servings\":number,\"estimatedMinutes\":number|null,\"rationale\":string,\"ingredients\":[{\"itemName\":string,\"quantity\":number|null,\"unit\":string|null,\"notes\":string|null}],\"instructions\":string}]}",
    `Create exactly ${input.missingSlots} distinct dinner recipe drafts for ${input.householdSize} people.`,
    `Goals: ${input.goals.join(", ")}.`,
    input.maxCookingMinutes ? `Maximum cooking time: ${input.maxCookingMinutes} minutes.` : "No cooking-time limit was provided.",
    input.dietaryExclusions.length ? `Avoid these explicit exclusions: ${input.dietaryExclusions.join(", ")}.` : "No dietary exclusions were provided.",
    input.likesDislikes ? `Likes/dislikes: ${input.likesDislikes}.` : "No likes or dislikes were provided.",
    input.selectedRecipes.length ? `Do not duplicate these selected meals: ${input.selectedRecipes.join("; ")}.` : "No saved meals are selected.",
    input.pantryNames.length ? `Available pantry item names (quantities are unknown): ${input.pantryNames.join(", ")}.` : "No pantry items were provided.",
    `Units must be one of: ${supportedUnitPromptVocabulary}; use null for an unknown or inapplicable unit. Do not claim allergen safety, nutrition, price, or pantry quantities.`,
  ].join("\n");
}

async function loadSavedRecipes(householdId: string): Promise<SavedRecipeRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("id,title,description,favorite,servings,instructions,recipe_ingredients(item_name,quantity,unit,notes)")
    .eq("household_id", householdId)
    .order("title", { ascending: true })
    .limit(100);
  if (error) throw new Error("We could not load saved recipes for planning.");
  return (data ?? []).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    favorite: recipe.favorite,
    servings: recipe.servings,
    instructions: recipe.instructions,
    ingredientNames: (recipe.recipe_ingredients ?? []).map((ingredient) => ingredient.item_name),
    ingredients: (recipe.recipe_ingredients ?? []).map((ingredient) => ({
      itemName: ingredient.item_name,
      quantity: ingredient.quantity,
      // Existing imported rows can predate the strict unit vocabulary. Never
      // claim an unsupported historical value is suitable for automated math.
      unit: normalizeSupportedUnit(ingredient.unit),
      notes: ingredient.notes,
    })),
  }));
}

/** Proposes saved recipes and local-only generated drafts without writing data. */
export async function generateWeeklyPlanProposal(input: unknown): Promise<WeeklyPlanProposal> {
  const parsed = weeklyPlanPreferencesSchema.safeParse(input);
  if (!parsed.success) throw new Error("Weekly planning preferences are invalid.");

  const { householdId } = await requireHousehold();
  const [savedRecipes, pantryResult] = await Promise.all([
    loadSavedRecipes(householdId),
    (async () => {
      const supabase = await createClient();
      return supabase.from("pantry_items").select("item_name").eq("household_id", householdId).order("item_name", { ascending: true }).limit(100);
    })(),
  ]);
  if (pantryResult.error) throw new Error("We could not load pantry details for planning.");

  const ranked = rankSavedRecipes(savedRecipes, parsed.data);
  const selected = ranked.slice(0, parsed.data.dinnerCount);
  const dates = weekDates(parsed.data.weekStart, parsed.data.dinnerCount);
  const items: WeeklyPlanProposalItem[] = selected.map((recipe, index) => ({
    plannedFor: dates[index], source: "saved", recipeId: recipe.id,
    savedRecipe: { title: recipe.title, description: recipe.description, servings: recipe.servings, instructions: recipe.instructions, ingredients: recipe.ingredients },
    rationale: recipe.favorite && parsed.data.preferFavorites ? "Saved favourite recipe" : "Saved recipe selected for your week",
    reviewRequired: recipe.reviewRequired,
  }));
  const missingSlots = parsed.data.dinnerCount - selected.length;
  if (!missingSlots) return { items, emptySlots: 0, ollama: { status: "ready" } };

  const readiness = await getOllamaReadiness();
  if (readiness.status !== "ready") return { items, emptySlots: missingSlots, ollama: readiness };

  const prompt = buildPrompt({
    householdSize: parsed.data.householdSize, missingSlots, goals: parsed.data.goals,
    maxCookingMinutes: parsed.data.maxCookingMinutes, dietaryExclusions: parsed.data.dietaryExclusions,
    likesDislikes: parsed.data.likesDislikes, selectedRecipes: selected.map((recipe) => recipe.title).slice(0, 20),
    pantryNames: (pantryResult.data ?? []).map((item) => item.item_name).slice(0, 50),
  });
  try {
    let drafts: GeneratedRecipeDraft[] | null = null;
    for (let attempt = 0; attempt < 2 && !drafts; attempt += 1) {
      const raw = await generateWithOllama(attempt === 0 ? prompt : `${prompt}\nYour previous response was invalid. Return only valid JSON matching the exact schema.`);
      const decoded = (() => { try { return JSON.parse(raw); } catch { return null; } })();
      const validated = generatedDraftListSchema.safeParse(decoded);
      if (validated.success && validated.data.drafts.length === missingSlots) drafts = validated.data.drafts;
    }
    if (!drafts) return { items, emptySlots: missingSlots, ollama: { status: "failed", message: "Ollama returned invalid recipe drafts. You can add recipes manually or try again." } };
    return {
      items: [...items, ...drafts.map((draft, index) => ({ plannedFor: dates[selected.length + index], source: "generated" as const, draft, reviewRequired: true }))],
      emptySlots: 0,
      ollama: { status: "ready" },
    };
  } catch (error) {
    const message = error instanceof OllamaGenerationError ? error.message : "Ollama could not generate recipe drafts.";
    return { items, emptySlots: missingSlots, ollama: { status: "failed", message } };
  }
}

/** Atomically persists the user-reviewed proposal through the household-scoped RPC. */
export async function confirmWeeklyPlan(input: unknown): Promise<{ success: true }> {
  const parsed = confirmWeeklyPlanSchema.safeParse(input);
  if (!parsed.success) throw new Error("Review the weekly plan details before confirming.");
  const { householdId } = await requireHousehold();
  const assignments = parsed.data.items.map((item) => item.source === "saved"
    ? { plannedFor: item.plannedFor, recipeId: item.recipeId, generatedRecipe: null }
    : {
      plannedFor: item.plannedFor,
      recipeId: null,
      generatedRecipe: {
        recipe: { title: item.draft.title, description: item.draft.rationale, sourceUrl: null, favorite: false, servings: item.draft.servings, instructions: item.draft.instructions, ingestionStatus: "needs_review" },
        ingredients: item.draft.ingredients.map((ingredient) => ({ itemName: ingredient.itemName, quantity: ingredient.quantity, unit: ingredient.unit, notes: ingredient.notes ?? null })),
      },
    });
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_weekly_dinner_plan", {
    p_household_id: householdId,
    p_week_start: parsed.data.weekStart,
    p_assignments: assignments,
  });
  if (error) throw new Error("We could not finalise that weekly plan. No changes were saved.");
  revalidatePath("/planner");
  revalidatePath("/recipes");
  revalidatePath("/shopping");
  return { success: true };
}
