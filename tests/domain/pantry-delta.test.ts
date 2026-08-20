import { describe, expect, it } from "vitest";
import { calculatePantryDelta } from "@/lib/domain/pantry-delta";

describe("calculatePantryDelta", () => {
  it("subtracts matching pantry items with safe conversion", () => {
    const result = calculatePantryDelta({
      required: [{ itemName: "rice", quantity: 1000, unit: "g", reviewRequired: false }],
      pantry: [{ id: "p1", itemName: "Rice", quantity: 0.25, unit: "kg" }],
    });

    expect(result).toEqual([
      {
        itemName: "rice",
        requiredQuantity: 1000,
        pantryQuantity: 250,
        deltaQuantity: 750,
        unit: "g",
        reviewRequired: false,
        reviewReason: null,
        pantryItemId: "p1",
      },
    ]);
  });

  it("flags ambiguous unit mismatches", () => {
    const result = calculatePantryDelta({
      required: [{ itemName: "onion", quantity: 1, unit: "each", reviewRequired: false }],
      pantry: [{ id: "p1", itemName: "onion", quantity: 300, unit: "g" }],
    });

    expect(result[0]).toMatchObject({
      itemName: "onion",
      reviewRequired: true,
      reviewReason: "Cannot convert g to each",
    });
  });

  it("preserves non-aggregatable source requirements without inventing a partial delta", () => {
    const sourceRequirements = [
      { itemName: "tomatoes", quantity: 400, unit: "g" },
      { itemName: "tomatoes", quantity: 2, unit: "can" },
    ];
    const result = calculatePantryDelta({
      required: [{
        itemName: "tomatoes",
        quantity: null,
        unit: null,
        reviewRequired: true,
        reviewReason: "Cannot combine requirements",
        sourceRequirements,
      }],
      pantry: [{ id: "p1", itemName: "Tomatoes", quantity: 1, unit: "can" }],
    });

    expect(result).toEqual([{
      itemName: "tomatoes",
      requiredQuantity: null,
      pantryQuantity: null,
      deltaQuantity: null,
      unit: null,
      reviewRequired: true,
      reviewReason: "Cannot combine requirements",
      pantryItemId: "p1",
      sourceRequirements,
    }]);
  });
});
