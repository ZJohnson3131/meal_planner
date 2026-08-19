import { describe, expect, it } from "vitest";
import { convertQuantity, normalizeSupportedUnit, normalizeUnit } from "@/lib/domain/units";

describe("unit conversion", () => {
  it("normalizes supported unit aliases", () => {
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit("litres")).toBe("l");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeSupportedUnit("pkts")).toBe("packet");
    expect(normalizeSupportedUnit("cans")).toBe("can");
    expect(normalizeSupportedUnit("cloves")).toBe("clove");
    expect(normalizeSupportedUnit("bunches")).toBe("bunch");
    expect(normalizeSupportedUnit("slices")).toBe("slice");
    expect(normalizeSupportedUnit("pinch")).toBeNull();
  });

  it("converts mass within the same dimension", () => {
    expect(convertQuantity(1.5, "kg", "g")).toEqual({ ok: true, quantity: 1500, unit: "g" });
    expect(convertQuantity(500, "g", "kg")).toEqual({ ok: true, quantity: 0.5, unit: "kg" });
  });

  it("converts volume within the same dimension", () => {
    expect(convertQuantity(2, "l", "ml")).toEqual({ ok: true, quantity: 2000, unit: "ml" });
    expect(convertQuantity(3, "tbsp", "tsp")).toEqual({ ok: true, quantity: 9, unit: "tsp" });
  });

  it("rejects ambiguous conversions", () => {
    expect(convertQuantity(1, "each", "g")).toEqual({
      ok: false,
      reason: "Cannot convert each to g",
    });
  });

  it("does not equate different count units", () => {
    expect(convertQuantity(1, "can", "packet")).toEqual({
      ok: false,
      reason: "Cannot convert can to packet",
    });
    expect(convertQuantity(2, "cans", "can")).toEqual({ ok: true, quantity: 2, unit: "can" });
  });
});
