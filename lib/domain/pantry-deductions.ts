import { convertQuantity } from "@/lib/domain/units";

export type DeductionIngredient = {
  id: string;
  itemName: string;
  quantity: number | null;
  unit: string | null;
};

export type DeductionPantryItem = {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
};

export type ExistingDeduction = {
  recipeIngredientId: string;
};

export type DeductionPlanItem = {
  mealPlanEntryId: string;
  recipeIngredientId: string;
  pantryItemId: string | null;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function buildDeductionPlan(input: {
  mealPlanEntryId: string;
  existingDeductions: ExistingDeduction[];
  ingredients: DeductionIngredient[];
  pantry: DeductionPantryItem[];
}): DeductionPlanItem[] {
  const alreadyDeducted = new Set(input.existingDeductions.map((item) => item.recipeIngredientId));

  return input.ingredients
    .filter((ingredient) => !alreadyDeducted.has(ingredient.id))
    .map((ingredient) => {
      const matches = input.pantry.filter((item) => normalizeName(item.itemName) === normalizeName(ingredient.itemName));

      if (matches.length !== 1) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: null,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: matches.length === 0 ? "No pantry match" : "Multiple pantry matches",
        };
      }

      const pantryItem = matches[0];
      if (ingredient.quantity === null || !ingredient.unit) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: pantryItem.id,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: "Missing ingredient quantity or unit",
        };
      }

      const converted = convertQuantity(ingredient.quantity, ingredient.unit, pantryItem.unit);
      if (!converted.ok) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: pantryItem.id,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: converted.reason,
        };
      }

      return {
        mealPlanEntryId: input.mealPlanEntryId,
        recipeIngredientId: ingredient.id,
        pantryItemId: pantryItem.id,
        itemName: normalizeName(ingredient.itemName),
        quantity: converted.quantity,
        unit: pantryItem.unit,
        reviewRequired: false,
        reviewReason: null,
      };
    });
}
