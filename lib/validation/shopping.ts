import { z } from "zod";

const isoDate = z.string().date();

/**
 * A bounded calendar range keeps shopping-list generation focused on a
 * practical planning window and prevents malformed dates from reaching the
 * database query.
 */
export const shoppingListRangeSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: "The shopping-list end date must be on or after its start date",
    path: ["endDate"],
  })
  .refine(
    ({ startDate, endDate }) => {
      const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
      const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
      return end - start <= 31 * 24 * 60 * 60 * 1000;
    },
    {
      message: "A shopping list can cover at most 32 days",
      path: ["endDate"],
    },
  );

export type ShoppingListRangeInput = z.infer<typeof shoppingListRangeSchema>;
