import { describe, expect, it } from "vitest";
import { exportShoppingListText } from "@/lib/domain/shopping-export";

describe("exportShoppingListText", () => {
  it("formats needed and review items", () => {
    expect(
      exportShoppingListText([
        { itemName: "rice", deltaQuantity: 750, unit: "g", reviewRequired: false },
        { itemName: "onion", deltaQuantity: 1, unit: "each", reviewRequired: true },
      ]),
    ).toBe("- rice: 750 g\n- onion: 1 each [review]");
  });

  it("omits unavailable quantity and unit without guessing", () => {
    expect(
      exportShoppingListText([
        { itemName: "herbs", deltaQuantity: null, unit: null, reviewRequired: true },
      ]),
    ).toBe("- herbs [review]");
  });

  it("does not leave a trailing space when a quantity has no unit", () => {
    expect(
      exportShoppingListText([
        { itemName: "onion", deltaQuantity: 2, unit: null, reviewRequired: false },
      ]),
    ).toBe("- onion: 2");
  });
});
