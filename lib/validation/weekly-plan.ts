import { z } from "zod";

import { SUPPORTED_COOKING_UNITS, normalizeSupportedUnit } from "@/lib/domain/units";
import { RECIPE_IMPORT_LIMITS } from "@/lib/recipes/recipe-import-contract";
import { recipeIngredientSchema, recipeSchema } from "@/lib/validation/recipes";

export const WEEKLY_PLAN_GOALS = ["simple", "high_protein", "budget_friendly", "family_friendly", "vegetarian", "pantry_friendly"] as const;
export type WeeklyPlanGoal = (typeof WEEKLY_PLAN_GOALS)[number];

const dateSchema = z.string().date();
const shortText = z.string().trim().max(200);
const optionalText = z.string().trim().max(RECIPE_IMPORT_LIMITS.descriptionCharacters).nullable().optional();
const generatedIngredientSchema = z.object({
  itemName: z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.titleCharacters),
  quantity: z.coerce.number().finite().positive().nullable(),
  // Model unit labels are untrusted. Preserve the line, but make unsupported
  // labels explicitly review-required rather than silently guessing a unit.
  unit: z.string().trim().max(RECIPE_IMPORT_LIMITS.unitCharacters).nullable().transform((value) => normalizeSupportedUnit(value)),
  notes: z.string().trim().max(RECIPE_IMPORT_LIMITS.ingredientLineCharacters).nullable().optional(),
});

export const weeklyPlanPreferencesSchema = z.object({
  weekStart: dateSchema.refine((value) => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, "Week must start on Monday"),
  householdSize: z.coerce.number().int().min(1).max(RECIPE_IMPORT_LIMITS.servingsMaximum),
  dinnerCount: z.coerce.number().int().min(1).max(7),
  goals: z.array(z.enum(WEEKLY_PLAN_GOALS)).min(1).max(WEEKLY_PLAN_GOALS.length),
  maxCookingMinutes: z.coerce.number().int().positive().max(1_440).nullable().optional(),
  dietaryExclusions: z.array(shortText.min(1)).max(20).default([]),
  likesDislikes: optionalText,
  preferFavorites: z.boolean().default(false),
});
export type WeeklyPlanPreferences = z.infer<typeof weeklyPlanPreferencesSchema>;

export const generatedRecipeDraftSchema = z.object({
  title: z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.titleCharacters),
  servings: z.coerce.number().finite().positive().max(RECIPE_IMPORT_LIMITS.servingsMaximum),
  estimatedMinutes: z.coerce.number().int().positive().max(1_440).nullable(),
  rationale: z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.descriptionCharacters),
  ingredients: z.array(generatedIngredientSchema).min(1).max(RECIPE_IMPORT_LIMITS.ingredients),
  instructions: z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.instructionsCharacters),
});
export type GeneratedRecipeDraft = z.infer<typeof generatedRecipeDraftSchema>;

export const generatedDraftListSchema = z.object({ drafts: z.array(generatedRecipeDraftSchema).max(7) });

export const weeklyPlanProposalItemSchema = z.discriminatedUnion("source", [
  z.object({ plannedFor: dateSchema, source: z.literal("saved"), recipeId: z.string().uuid(), savedRecipe: z.object({ title: z.string(), description: z.string().nullable(), servings: z.number().nullable(), instructions: z.string(), ingredients: z.array(recipeIngredientSchema) }), rationale: z.string().trim().max(RECIPE_IMPORT_LIMITS.descriptionCharacters).default(""), reviewRequired: z.boolean().default(false) }),
  z.object({ plannedFor: dateSchema, source: z.literal("generated"), draft: generatedRecipeDraftSchema, reviewRequired: z.boolean().default(true) }),
]);
export type WeeklyPlanProposalItem = z.infer<typeof weeklyPlanProposalItemSchema>;

const generatedRecipeForConfirmationSchema = recipeSchema.extend({
  ingestionStatus: z.literal("needs_review"),
});

export const confirmWeeklyPlanSchema = z.object({
  weekStart: dateSchema.refine((value) => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, "Week must start on Monday"),
  items: z.array(z.discriminatedUnion("source", [
    z.object({ plannedFor: dateSchema, source: z.literal("saved"), recipeId: z.string().uuid() }),
    z.object({ plannedFor: dateSchema, source: z.literal("generated"), draft: generatedRecipeDraftSchema }),
  ])).min(1).max(7),
}).superRefine((value, context) => {
  const expectedDates = new Set(Array.from({ length: 7 }, (_, index) => new Date(Date.parse(`${value.weekStart}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10)));
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!expectedDates.has(item.plannedFor) || seen.has(item.plannedFor)) context.addIssue({ code: "custom", message: "Dinner dates must be unique days in the selected week." });
    seen.add(item.plannedFor);
    if (item.source === "generated") {
      const recipe = generatedRecipeForConfirmationSchema.safeParse({
        title: item.draft.title, description: item.draft.rationale, sourceUrl: null, favorite: false,
        servings: item.draft.servings, instructions: item.draft.instructions, ingredients: item.draft.ingredients,
        ingestionStatus: "needs_review",
      });
      if (!recipe.success) context.addIssue({ code: "custom", message: "A generated recipe has invalid editable fields." });
    }
  }
});
export type ConfirmWeeklyPlanInput = z.infer<typeof confirmWeeklyPlanSchema>;

export const supportedUnitPromptVocabulary = SUPPORTED_COOKING_UNITS.join(", ");

export function normalizeGeneratedUnit(unit: string | null): string | null {
  return unit === null ? null : normalizeSupportedUnit(unit);
}
