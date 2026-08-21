import { z } from "zod";

import { normalizeSupportedUnit } from "@/lib/domain/units";
import {
  RECIPE_IMPORT_LIMITS,
  sanitizeRecipeUrl,
} from "@/lib/recipes/recipe-import-contract";

const plainText = z.string().trim().min(1).max(RECIPE_IMPORT_LIMITS.descriptionCharacters);
const recipeUnitSchema = z
  .string()
  .trim()
  .min(1)
  .max(RECIPE_IMPORT_LIMITS.unitCharacters)
  .refine((value) => normalizeSupportedUnit(value) !== null, {
    message: "Recipe unit is not supported",
  })
  .transform((value) => normalizeSupportedUnit(value)!);

export const recipeIngredientSchema = z.object({
  itemName: plainText.max(RECIPE_IMPORT_LIMITS.titleCharacters),
  quantity: z.coerce.number().finite().positive().nullable(),
  unit: recipeUnitSchema.nullable(),
  notes: z.string().trim().max(RECIPE_IMPORT_LIMITS.ingredientLineCharacters).nullable().optional(),
});

const recipeUrlSchema = z
  .string()
  .trim()
  .max(RECIPE_IMPORT_LIMITS.sourceUrlCharacters)
  .url()
  .refine(
    (value) => {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:")
        && !url.username
        && !url.password;
    },
    { message: "Recipe source URL must use HTTP or HTTPS without credentials" },
  );

/** URL accepted for an outbound fetch; source redaction happens after parsing. */
export const recipeFetchUrlSchema = recipeUrlSchema.transform(
  (value, context) => {
    const url = sanitizeRecipeUrl(value, {
      allowHttp: false,
      removeSensitiveQueryParameters: false,
    });
    if (!url) {
      context.addIssue({
        code: "custom",
        message: "Recipe import URL must use HTTPS",
      });
      return z.NEVER;
    }
    return url;
  },
);

/** URL safe to persist and display to other household members. */
export const recipeSourceUrlSchema = recipeUrlSchema.transform(
  (value) => sanitizeRecipeUrl(value)!,
);

export const recipeSchema = z.object({
  title: plainText.max(RECIPE_IMPORT_LIMITS.titleCharacters),
  description: z.string().trim().max(RECIPE_IMPORT_LIMITS.descriptionCharacters).nullable().optional(),
  sourceUrl: recipeSourceUrlSchema.nullable().optional(),
  favorite: z.boolean().default(false),
  servings: z.coerce.number().finite().positive().max(RECIPE_IMPORT_LIMITS.servingsMaximum).nullable().optional(),
  instructions: z.string().trim().max(RECIPE_IMPORT_LIMITS.instructionsCharacters).default(""),
  ingredients: z.array(recipeIngredientSchema).min(1).max(RECIPE_IMPORT_LIMITS.ingredients),
});

export type RecipeInput = z.infer<typeof recipeSchema>;
