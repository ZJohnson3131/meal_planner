import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "@/lib/domain/ingredient-aggregation";

describe("aggregateIngredients", () => {
  it("groups ingredients by normalized item name and compatible unit", () => {
    const result = aggregateIngredients([
      { itemName: "Chicken Breast", quantity: 500, unit: "g" },
      { itemName: "chicken breast", quantity: 0.5, unit: "kg" },
      { itemName: "Rice", quantity: 1, unit: "kg" },
    ]);

    expect(result).toEqual([
      { itemName: "chicken breast", quantity: 1000, unit: "g", reviewRequired: false },
      { itemName: "rice", quantity: 1, unit: "kg", reviewRequired: false },
    ]);
  });
});
