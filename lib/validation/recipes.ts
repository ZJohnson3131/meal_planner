import { z } from "zod";

const plainText = z.string().trim().min(1).max(10_000);

export const recipeIngredientSchema = z.object({
  itemName: plainText.max(500),
  quantity: z.coerce.number().finite().positive().nullable(),
  unit: z.string().trim().min(1).max(100).nullable(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const recipeSourceUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "Recipe source URL must use HTTP or HTTPS" },
  );

export const recipeSchema = z.object({
  title: plainText.max(500),
  description: z.string().trim().max(10_000).nullable().optional(),
  sourceUrl: recipeSourceUrlSchema.nullable().optional(),
  favorite: z.boolean().default(false),
  servings: z.coerce.number().finite().positive().max(10_000).nullable().optional(),
  instructions: z.string().trim().max(100_000).default(""),
  ingredients: z.array(recipeIngredientSchema).min(1).max(500),
});

export type RecipeInput = z.infer<typeof recipeSchema>;
