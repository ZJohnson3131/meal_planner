import type { AggregatedIngredient } from "@/lib/domain/ingredient-aggregation";
import { convertQuantity } from "@/lib/domain/units";

export type PantryItemInput = {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
};

export type PantryDeltaItem = {
  itemName: string;
  requiredQuantity: number | null;
  pantryQuantity: number | null;
  deltaQuantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
  pantryItemId: string | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function calculatePantryDelta(input: {
  required: AggregatedIngredient[];
  pantry: PantryItemInput[];
}): PantryDeltaItem[] {
  return input.required.map((required) => {
    const matches = input.pantry.filter((item) => normalizeName(item.itemName) === required.itemName);

    if (matches.length === 0) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: 0,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: required.reviewRequired,
        reviewReason: required.reviewRequired ? "Ingredient requires review" : null,
        pantryItemId: null,
      };
    }

    if (matches.length > 1) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: null,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: "Multiple pantry matches",
        pantryItemId: null,
      };
    }

    const pantryItem = matches[0];
    if (required.quantity === null || !required.unit) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: pantryItem.quantity,
        deltaQuantity: null,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: "Missing required quantity or unit",
        pantryItemId: pantryItem.id,
      };
    }

    const converted = convertQuantity(pantryItem.quantity, pantryItem.unit, required.unit);
    if (!converted.ok) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: pantryItem.quantity,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: converted.reason,
        pantryItemId: pantryItem.id,
      };
    }

    return {
      itemName: required.itemName,
      requiredQuantity: required.quantity,
      pantryQuantity: converted.quantity,
      deltaQuantity: Math.max(0, Number((required.quantity - converted.quantity).toFixed(4))),
      unit: required.unit,
      reviewRequired: required.reviewRequired,
      reviewReason: required.reviewRequired ? "Ingredient requires review" : null,
      pantryItemId: pantryItem.id,
    };
  });
}
