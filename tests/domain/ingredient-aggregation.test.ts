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

  it("does not publish a partial total when one grouped quantity is unknown", () => {
    const result = aggregateIngredients([
      { itemName: "Rice", quantity: 500, unit: "g" },
      { itemName: " rice ", quantity: null, unit: "kg" },
    ]);

    expect(result).toEqual([
      {
        itemName: "rice",
        quantity: null,
        unit: "g",
        reviewRequired: true,
        reviewReason: "Cannot combine requirements: 500 g; unknown quantity kg",
        sourceRequirements: [
          { itemName: "rice", quantity: 500, unit: "g" },
          { itemName: "rice", quantity: null, unit: "kg" },
        ],
      },
    ]);
  });

  it("retains every source requirement when grouped units are incompatible", () => {
    const result = aggregateIngredients([
      { itemName: "Tomatoes", quantity: 400, unit: "g" },
      { itemName: "tomatoes", quantity: 2, unit: "can" },
      { itemName: "tomatoes", quantity: 1, unit: null },
    ]);

    expect(result[0]).toMatchObject({
      itemName: "tomatoes",
      quantity: null,
      unit: null,
      reviewRequired: true,
      sourceRequirements: [
        { itemName: "tomatoes", quantity: 400, unit: "g" },
        { itemName: "tomatoes", quantity: 2, unit: "can" },
        { itemName: "tomatoes", quantity: 1, unit: null },
      ],
    });
    expect(result[0].reviewReason).toContain("400 g; 2 can; 1 unknown unit");
  });

  it("marks unsupported and non-finite requirements for review without partial totals", () => {
    const result = aggregateIngredients([
      { itemName: "Herbs", quantity: 1, unit: "handful" },
      { itemName: "Herbs", quantity: Number.NaN, unit: "g" },
    ]);

    expect(result[0]).toMatchObject({
      itemName: "herbs",
      quantity: null,
      unit: null,
      reviewRequired: true,
    });
  });
});
