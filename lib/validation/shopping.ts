import { z } from "zod";

import {
  addCalendarDays,
  isIsoCalendarDate,
} from "@/lib/domain/calendar";

export const MAX_SHOPPING_LIST_CALENDAR_DAYS = 32;

const isoDate = z.string().refine(isIsoCalendarDate, {
  message: "Expected a valid calendar date in YYYY-MM-DD format",
});

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
      if (!isIsoCalendarDate(startDate) || !isIsoCalendarDate(endDate)) return false;
      return endDate <= addCalendarDays(
        startDate,
        MAX_SHOPPING_LIST_CALENDAR_DAYS - 1,
      );
    },
    {
      message: `A shopping list can cover at most ${MAX_SHOPPING_LIST_CALENDAR_DAYS} days`,
      path: ["endDate"],
    },
  );

export const shoppingItemStatusInputSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(["needed", "checked", "dismissed"]),
});

export type ShoppingListRangeInput = z.infer<typeof shoppingListRangeSchema>;
