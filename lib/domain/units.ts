export type UnitDimension = "mass" | "volume" | "count";

/**
 * The canonical vocabulary stored by the application. Keep this deliberately
 * small: an imported or user-entered value should be reviewed instead of being
 * silently treated as a unit we do not understand.
 */
export const SUPPORTED_COOKING_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "each",
  "packet",
  "can",
  "slice",
  "clove",
  "bunch",
] as const;

export type SupportedCookingUnit = (typeof SUPPORTED_COOKING_UNITS)[number];

type UnitDefinition = {
  canonical: SupportedCookingUnit;
  dimension: UnitDimension;
  toBase: number;
};

const units: Record<string, UnitDefinition> = {
  g: { canonical: "g", dimension: "mass", toBase: 1 },
  gram: { canonical: "g", dimension: "mass", toBase: 1 },
  grams: { canonical: "g", dimension: "mass", toBase: 1 },
  kg: { canonical: "kg", dimension: "mass", toBase: 1000 },
  kilogram: { canonical: "kg", dimension: "mass", toBase: 1000 },
  kilograms: { canonical: "kg", dimension: "mass", toBase: 1000 },
  ml: { canonical: "ml", dimension: "volume", toBase: 1 },
  millilitre: { canonical: "ml", dimension: "volume", toBase: 1 },
  millilitres: { canonical: "ml", dimension: "volume", toBase: 1 },
  milliliter: { canonical: "ml", dimension: "volume", toBase: 1 },
  milliliters: { canonical: "ml", dimension: "volume", toBase: 1 },
  l: { canonical: "l", dimension: "volume", toBase: 1000 },
  litre: { canonical: "l", dimension: "volume", toBase: 1000 },
  litres: { canonical: "l", dimension: "volume", toBase: 1000 },
  liter: { canonical: "l", dimension: "volume", toBase: 1000 },
  liters: { canonical: "l", dimension: "volume", toBase: 1000 },
  tsp: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoon: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoons: { canonical: "tsp", dimension: "volume", toBase: 5 },
  tbsp: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoon: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoons: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  cup: { canonical: "cup", dimension: "volume", toBase: 250 },
  cups: { canonical: "cup", dimension: "volume", toBase: 250 },
  each: { canonical: "each", dimension: "count", toBase: 1 },
  packet: { canonical: "packet", dimension: "count", toBase: 1 },
  packets: { canonical: "packet", dimension: "count", toBase: 1 },
  pkt: { canonical: "packet", dimension: "count", toBase: 1 },
  pkts: { canonical: "packet", dimension: "count", toBase: 1 },
  can: { canonical: "can", dimension: "count", toBase: 1 },
  cans: { canonical: "can", dimension: "count", toBase: 1 },
  slice: { canonical: "slice", dimension: "count", toBase: 1 },
  slices: { canonical: "slice", dimension: "count", toBase: 1 },
  clove: { canonical: "clove", dimension: "count", toBase: 1 },
  cloves: { canonical: "clove", dimension: "count", toBase: 1 },
  bunch: { canonical: "bunch", dimension: "count", toBase: 1 },
  bunches: { canonical: "bunch", dimension: "count", toBase: 1 },
};

function lookupUnit(unit: string | null | undefined): UnitDefinition | undefined {
  return units[String(unit ?? "").trim().toLowerCase()];
}

/**
 * Normalizes a supported unit or returns null for a blank or unsupported input.
 * Use this at input boundaries; unlike the legacy normalizeUnit helper, it never
 * passes unknown strings through as if they were valid units.
 */
export function normalizeSupportedUnit(unit: string | null | undefined): SupportedCookingUnit | null {
  return lookupUnit(unit)?.canonical ?? null;
}

export function isSupportedCookingUnit(unit: string | null | undefined): unit is SupportedCookingUnit {
  return normalizeSupportedUnit(unit) !== null;
}

export type ConversionResult =
  | { ok: true; quantity: number; unit: string }
  | { ok: false; reason: string };

export function normalizeUnit(unit: string | null | undefined): string {
  const key = String(unit ?? "").trim().toLowerCase();
  return lookupUnit(key)?.canonical ?? key;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): ConversionResult {
  const from = lookupUnit(fromUnit);
  const to = lookupUnit(toUnit);

  // Count labels are not interchangeable: one can is not necessarily one
  // packet, slice, clove, bunch, or each. Only match identical count units.
  if (!from || !to || from.dimension !== to.dimension || (from.dimension === "count" && from.canonical !== to.canonical)) {
    return { ok: false, reason: `Cannot convert ${fromUnit} to ${toUnit}` };
  }

  const baseQuantity = quantity * from.toBase;

  return {
    ok: true,
    quantity: Number((baseQuantity / to.toBase).toFixed(4)),
    unit: to.canonical,
  };
}
