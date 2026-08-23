"use server";

import { revalidatePath } from "next/cache";

import { requireHousehold } from "@/lib/auth/household";
import { rankSavedRecipes, type RankableSavedRecipe } from "@/lib/domain/weekly-plan-ranking";
import { normalizeSupportedUnit, type SupportedCookingUnit } from "@/lib/domain/units";
import type {
  GeneratedRecipeDraft,
  WeeklyPlanEmptySlot,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
  WeeklyPlanExistingEntry,
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
  WeeklyPlanEmptySlot,
  WeeklyPlanPreferences,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
} from "@/lib/domain/weekly-plan-types";

type SavedRecipeRecord = RankableSavedRecipe & {
  servings: number | null;
  instructions: string;
  ingredients: Array<{ itemName: string; quantity: number | null; unit: SupportedCookingUnit | null; notes: string | null }>;
};

function emptySlotItems(dates: string[], offset: number, count: number, reason: string, currentByDate: Map<string, WeeklyPlanExistingEntry>): WeeklyPlanEmptySlot[] {
  return dates.slice(offset, offset + count).map((plannedFor) => ({
    plannedFor,
    current: currentByDate.get(plannedFor) ?? null,
    source: "empty" as const,
    draft: {
      title: "",
      servings: 1,
      estimatedMinutes: null,
      rationale: "",
      ingredients: [{ itemName: "", quantity: null, unit: null, notes: null }],
      instructions: "",
    },
    reason,
    reviewRequired: true as const,
  }));
}

async function loadCurrentEntries(householdId: string, weekStart: string): Promise<WeeklyPlanExistingEntry[]> {
  const supabase = await createClient();
  const slotResult = await supabase
    .from("meal_slots")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", "Dinner")
    .eq("is_default", true)
    .maybeSingle();
  if (slotResult.error || !slotResult.data) throw new Error("We could not load the Dinner schedule for planning.");
  const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const entriesResult = await supabase
    .from("meal_plan_entries")
    .select("planned_for, recipe_id, status, recipe:recipes(title)")
    .eq("household_id", householdId)
    .eq("meal_slot_id", slotResult.data.id)
    .gte("planned_for", weekStart)
    .lte("planned_for", weekEnd);
  if (entriesResult.error) throw new Error("We could not load current dinners for planning.");
  return (entriesResult.data ?? []).map((entry) => {
    const recipe = Array.isArray(entry.recipe) ? entry.recipe[0] : entry.recipe;
    return {
      plannedFor: entry.planned_for,
      recipeId: entry.recipe_id,
      recipeTitle: recipe?.title ?? "Untitled dinner",
      status: entry.status,
    };
  });
}

function buildPrompt(input: {
  householdSize: number;
  cookingEffort: "quick" | "balanced" | "project";
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
    `Create exactly ${input.missingSlots} distinct dinner recipe draft for ${input.householdSize} people.`,
    `Cooking effort: ${input.cookingEffort}.`,
    input.goals.length ? `Goals: ${input.goals.join(", ")}.` : "No weekly goals were provided.",
    input.maxCookingMinutes ? `Maximum cooking time: ${input.maxCookingMinutes} minutes.` : "No cooking-time limit was provided.",
    input.dietaryExclusions.length ? `Avoid these explicit exclusions: ${input.dietaryExclusions.join(", ")}.` : "No dietary exclusions were provided.",
    input.likesDislikes ? `Likes/dislikes: ${input.likesDislikes}.` : "No likes or dislikes were provided.",
    input.selectedRecipes.length ? `Do not duplicate these selected meals: ${input.selectedRecipes.join("; ")}.` : "No saved meals are selected.",
    input.pantryNames.length ? `Available pantry item names (quantities are unknown): ${input.pantryNames.join(", ")}.` : "No pantry items were provided.",
    `Keep the draft compact: use 3 to 6 ingredients and no more than 2 short instruction sentences. Units must be one of: ${supportedUnitPromptVocabulary}; use null for an unknown or inapplicable unit. Do not claim allergen safety, nutrition, price, or pantry quantities.`,
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
  const [savedRecipes, pantryResult, currentEntries] = await Promise.all([
    loadSavedRecipes(householdId),
    (async () => {
      const supabase = await createClient();
      return supabase.from("pantry_items").select("item_name").eq("household_id", householdId).order("item_name", { ascending: true }).limit(100);
    })(),
    loadCurrentEntries(householdId, parsed.data.weekStart),
  ]);
  if (pantryResult.error) throw new Error("We could not load pantry details for planning.");

  const currentByDate = new Map(currentEntries.map((entry) => [entry.plannedFor, entry]));
  const selectedCurrentEntries = parsed.data.selectedDates
    .map((date) => currentByDate.get(date))
    .filter((entry): entry is WeeklyPlanExistingEntry => Boolean(entry));
  if (selectedCurrentEntries.some((entry) => entry.status === "completed")) {
    throw new Error("One of the selected dinners was completed while this planner was open. Refresh the week and choose another night.");
  }

  const assignedRecipeIds = new Set(currentEntries.map((entry) => entry.recipeId));
  const ranked = rankSavedRecipes(savedRecipes.filter((recipe) => !assignedRecipeIds.has(recipe.id)), parsed.data);
  const selected = ranked.slice(0, parsed.data.selectedDates.length);
  const dates = parsed.data.selectedDates;
  const items: WeeklyPlanProposalItem[] = selected.map((recipe, index) => ({
    plannedFor: dates[index], current: currentByDate.get(dates[index]) ?? null, source: "saved", recipeId: recipe.id,
    savedRecipe: { title: recipe.title, description: recipe.description, servings: recipe.servings, instructions: recipe.instructions, ingredients: recipe.ingredients },
    rationale: recipe.favorite && parsed.data.preferFavorites ? "Saved favourite recipe" : "Saved recipe selected for your week",
    reviewRequired: recipe.reviewRequired,
  }));
  const missingSlots = parsed.data.selectedDates.length - selected.length;
  if (!missingSlots) return { items, emptySlots: 0, ollama: { status: "ready" } };

  const readiness = await getOllamaReadiness();
  if (readiness.status !== "ready") {
    return {
      items: [...items, ...emptySlotItems(dates, selected.length, missingSlots, readiness.message, currentByDate)],
      emptySlots: missingSlots,
      ollama: readiness,
    };
  }

  const drafts: GeneratedRecipeDraft[] = [];
  const failedProposal = (message: string): WeeklyPlanProposal => ({
    items: [
      ...items,
      ...drafts.map((draft, index) => ({
        plannedFor: dates[selected.length + index],
        current: currentByDate.get(dates[selected.length + index]) ?? null,
        source: "generated" as const,
        draft,
        reviewRequired: true as const,
      })),
      ...emptySlotItems(
        dates,
        selected.length + drafts.length,
        missingSlots - drafts.length,
        message,
        currentByDate,
      ),
    ],
    emptySlots: missingSlots - drafts.length,
    ollama: { status: "failed", message },
  });

  try {
    const selectedRecipeTitles = [...selected.map((recipe) => recipe.title), ...currentEntries.map((entry) => entry.recipeTitle)].slice(0, 20);
    const pantryNames = (pantryResult.data ?? []).map((item) => item.item_name).slice(0, 50);

    // Qwen3's local default context is 4K tokens. Asking it for seven full
    // recipe objects can exceed that budget (and leave a CPU-only runtime
    // busy after a timed-out request), so generate and validate one compact
    // draft at a time.
    for (let slot = 0; slot < missingSlots; slot += 1) {
      const prompt = buildPrompt({
        householdSize: parsed.data.householdSize, cookingEffort: parsed.data.cookingEffort, missingSlots: 1, goals: parsed.data.goals,
        maxCookingMinutes: parsed.data.maxCookingMinutes, dietaryExclusions: parsed.data.dietaryExclusions,
        likesDislikes: parsed.data.likesDislikes,
        selectedRecipes: [...selectedRecipeTitles, ...drafts.map((draft) => draft.title)].slice(0, 20),
        pantryNames,
      });
      let draft: GeneratedRecipeDraft | null = null;
      for (let attempt = 0; attempt < 2 && !draft; attempt += 1) {
        const raw = await generateWithOllama(attempt === 0 ? prompt : `${prompt}\nYour previous response was invalid. Return only valid JSON matching the exact schema.`);
        const decoded = (() => { try { return JSON.parse(raw); } catch { return null; } })();
        const validated = generatedDraftListSchema.safeParse(decoded);
        if (validated.success && validated.data.drafts.length === 1) draft = validated.data.drafts[0];
      }
      if (!draft) return failedProposal("Ollama returned an invalid recipe draft. Complete the empty dinner slots manually or try again.");
      drafts.push(draft);
    }
    return {
      items: [...items, ...drafts.map((draft, index) => ({ plannedFor: dates[selected.length + index], current: currentByDate.get(dates[selected.length + index]) ?? null, source: "generated" as const, draft, reviewRequired: true }))],
      emptySlots: 0,
      ollama: { status: "ready" },
    };
  } catch (error) {
    const message = error instanceof OllamaGenerationError ? error.message : "Ollama could not generate recipe drafts.";
    return failedProposal(message);
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
