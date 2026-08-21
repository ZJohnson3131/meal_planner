import type {
  AggregatedIngredient,
  IngredientRequirementComponent,
} from "@/lib/domain/ingredient-aggregation";
import {
  convertQuantity,
  normalizeSupportedUnit,
  roundQuantity,
} from "@/lib/domain/units";

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
  sourceRequirements?: IngredientRequirementComponent[];
};

const INGREDIENT_REVIEW_REASON = "Ingredient requires review";
const INVALID_REQUIREMENT_REASON = "Missing or unsupported required quantity or unit";
const INVALID_PANTRY_QUANTITY_REASON = "Pantry quantity is invalid";
const MULTIPLE_MATCHES_REASON = "Multiple pantry matches";

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function reviewedRequirement(required: AggregatedIngredient, reason: string): PantryDeltaItem {
  return {
    itemName: required.itemName,
    requiredQuantity: null,
    pantryQuantity: null,
    deltaQuantity: null,
    unit: required.unit,
    reviewRequired: true,
    reviewReason: reason,
    pantryItemId: null,
    ...(required.sourceRequirements ? { sourceRequirements: required.sourceRequirements } : {}),
  };
}

function addMatchContext(result: PantryDeltaItem, matches: PantryItemInput[]): PantryDeltaItem {
  if (matches.length === 1) {
    result.pantryItemId = matches[0].id;
  } else if (matches.length > 1) {
    result.reviewReason = `${result.reviewReason}; ${MULTIPLE_MATCHES_REASON}`;
  }

  return result;
}

function isValidQuantity(quantity: number | null): quantity is number {
  return quantity !== null && Number.isFinite(quantity) && quantity >= 0;
}

export function calculatePantryDelta(input: {
  required: AggregatedIngredient[];
  pantry: PantryItemInput[];
}): PantryDeltaItem[] {
  const pantryByName = new Map<string, PantryItemInput[]>();
  for (const item of input.pantry) {
    const itemName = normalizeName(item.itemName);
    const matches = pantryByName.get(itemName) ?? [];
    matches.push(item);
    pantryByName.set(itemName, matches);
  }

  return input.required.map((required) => {
    const matches = pantryByName.get(normalizeName(required.itemName)) ?? [];
    const requiredUnit = normalizeSupportedUnit(required.unit);

    if (required.reviewRequired) {
      return addMatchContext(
        reviewedRequirement(required, required.reviewReason ?? INGREDIENT_REVIEW_REASON),
        matches,
      );
    }

    if (!isValidQuantity(required.quantity) || requiredUnit === null) {
      return addMatchContext(reviewedRequirement(required, INVALID_REQUIREMENT_REASON), matches);
    }

    if (matches.length === 0) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: 0,
        deltaQuantity: required.quantity,
        unit: requiredUnit,
        reviewRequired: false,
        reviewReason: null,
        pantryItemId: null,
      };
    }

    if (matches.length > 1) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: null,
        deltaQuantity: null,
        unit: requiredUnit,
        reviewRequired: true,
        reviewReason: MULTIPLE_MATCHES_REASON,
        pantryItemId: null,
      };
    }

    const pantryItem = matches[0];
    if (!isValidQuantity(pantryItem.quantity)) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: null,
        deltaQuantity: null,
        unit: requiredUnit,
        reviewRequired: true,
        reviewReason: INVALID_PANTRY_QUANTITY_REASON,
        pantryItemId: pantryItem.id,
      };
    }

    const converted = convertQuantity(pantryItem.quantity, pantryItem.unit, requiredUnit);
    if (!converted.ok) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: null,
        deltaQuantity: null,
        unit: requiredUnit,
        reviewRequired: true,
        reviewReason: converted.reason,
        pantryItemId: pantryItem.id,
      };
    }

    return {
      itemName: required.itemName,
      requiredQuantity: required.quantity,
      pantryQuantity: converted.quantity,
      deltaQuantity: Math.max(0, roundQuantity(required.quantity - converted.quantity)),
      unit: requiredUnit,
      reviewRequired: false,
      reviewReason: null,
      pantryItemId: pantryItem.id,
    };
  });
}
