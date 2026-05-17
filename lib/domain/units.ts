export type UnitDimension = "mass" | "volume" | "count";

type UnitDefinition = {
  canonical: string;
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
  l: { canonical: "l", dimension: "volume", toBase: 1000 },
  litre: { canonical: "l", dimension: "volume", toBase: 1000 },
  litres: { canonical: "l", dimension: "volume", toBase: 1000 },
  tsp: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoon: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoons: { canonical: "tsp", dimension: "volume", toBase: 5 },
  tbsp: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoon: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoons: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  each: { canonical: "each", dimension: "count", toBase: 1 },
};

export type ConversionResult =
  | { ok: true; quantity: number; unit: string }
  | { ok: false; reason: string };

export function normalizeUnit(unit: string | null | undefined): string {
  const key = String(unit ?? "").trim().toLowerCase();
  return units[key]?.canonical ?? key;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): ConversionResult {
  const from = units[String(fromUnit).trim().toLowerCase()];
  const to = units[String(toUnit).trim().toLowerCase()];

  if (!from || !to || from.dimension !== to.dimension) {
    return { ok: false, reason: `Cannot convert ${fromUnit} to ${toUnit}` };
  }

  const baseQuantity = quantity * from.toBase;

  return {
    ok: true,
    quantity: Number((baseQuantity / to.toBase).toFixed(4)),
    unit: to.canonical,
  };
}
