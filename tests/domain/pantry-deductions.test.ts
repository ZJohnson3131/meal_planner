import { describe, expect, it } from "vitest";
import { buildDeductionPlan } from "@/lib/domain/pantry-deductions";

describe("buildDeductionPlan", () => {
  it("deducts clean matches once", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [],
      ingredients: [{ id: "ri-1", itemName: "rice", quantity: 500, unit: "g" }],
      pantry: [{ id: "p1", itemName: "rice", quantity: 1, unit: "kg" }],
    });

    expect(result).toEqual([
      {
        mealPlanEntryId: "meal-1",
        recipeIngredientId: "ri-1",
        pantryItemId: "p1",
        itemName: "rice",
        quantity: 0.5,
        unit: "kg",
        reviewRequired: false,
        reviewReason: null,
      },
    ]);
  });

  it("does not double deduct an already deducted ingredient", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [{ recipeIngredientId: "ri-1" }],
      ingredients: [{ id: "ri-1", itemName: "rice", quantity: 500, unit: "g" }],
      pantry: [{ id: "p1", itemName: "rice", quantity: 1, unit: "kg" }],
    });

    expect(result).toEqual([]);
  });

  it("flags ambiguous conversions for review", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [],
      ingredients: [{ id: "ri-1", itemName: "onion", quantity: 1, unit: "each" }],
      pantry: [{ id: "p1", itemName: "onion", quantity: 300, unit: "g" }],
    });

    expect(result[0]).toMatchObject({
      reviewRequired: true,
      reviewReason: "Cannot convert each to g",
    });
  });
});
