import { z } from "zod";

import { normalizeSupportedUnit } from "@/lib/domain/units";

export const PANTRY_INPUT_LIMITS = Object.freeze({
  categoryCharacters: 500,
  itemNameCharacters: 500,
  unitCharacters: 100,
});

const optionalText = z.string().trim().max(PANTRY_INPUT_LIMITS.categoryCharacters).optional();
const pantryUnitSchema = z
  .string()
  .trim()
  .min(1)
  .max(PANTRY_INPUT_LIMITS.unitCharacters)
  .refine((value) => normalizeSupportedUnit(value) !== null, {
    message: "Pantry unit is not supported",
  })
  .transform((value) => normalizeSupportedUnit(value)!);

export const pantryItemSchema = z.object({
  itemName: z.string().trim().min(1).max(PANTRY_INPUT_LIMITS.itemNameCharacters),
  quantity: z.coerce.number().finite().min(0),
  unit: pantryUnitSchema,
  category: optionalText,
  expiryDate: z.string().date().optional(),
});

export const pantryItemVersionSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

export type PantryItemInput = z.infer<typeof pantryItemSchema>;
