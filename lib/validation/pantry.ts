import { z } from "zod";

const optionalText = z.string().trim().max(500).optional();

export const pantryItemSchema = z.object({
  itemName: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().finite().min(0),
  unit: z.string().trim().min(1).max(100),
  category: optionalText,
  expiryDate: z.string().date().optional(),
});

export type PantryItemInput = z.infer<typeof pantryItemSchema>;
