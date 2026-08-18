import { normalizeUnit } from "@/lib/domain/units";

const MAX_INGREDIENT_LINE_LENGTH = 2_000;

const knownCountUnits = new Set([
  "can",
  "cans",
  "clove",
  "cloves",
  "bunch",
  "bunches",
  "packet",
  "packets",
  "piece",
  "pieces",
  "pinch",
  "pinches",
  "slice",
  "slices",
]);

const knownStandardUnits = new Set(["g", "kg", "ml", "l", "tsp", "tbsp", "each"]);

export type ParsedIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

function parseNumber(raw: string): number | null {
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    return denominator > 0 ? Number((whole + numerator / denominator).toFixed(4)) : null;
  }

  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function splitNotes(value: string): { itemName: string; notes: string | null } {
  const match = value.match(/^(.+?)(?:\s*[,;]\s*|\s+\()(.+?)(?:\))?$/);
  if (!match) return { itemName: value, notes: null };

  return {
    itemName: match[1].trim(),
    notes: match[2].trim() || null,
  };
}

/**
 * Makes a conservative, editable ingredient record from a human recipe line.
 * Unknown words after a quantity stay in the item name unless they are a known
 * unit; this avoids incorrectly treating "1 lemon" as a unit named lemon.
 */
export function parseIngredientLine(line: string): ParsedIngredient {
  const trimmed = String(line ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INGREDIENT_LINE_LENGTH);

  if (!trimmed) {
    return { itemName: "", quantity: null, unit: null, notes: null };
  }

  const match = trimmed.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    const { itemName, notes } = splitNotes(trimmed);
    return { itemName: itemName.toLowerCase(), quantity: null, unit: null, notes };
  }

  const quantity = parseNumber(match[1]);
  const remainder = match[2].trim();
  if (quantity === null || !remainder) {
    return { itemName: remainder.toLowerCase(), quantity: null, unit: null, notes: null };
  }

  const unitMatch = remainder.match(/^([a-zA-Z]+)\.?\s+(.+)$/);
  const rawUnit = unitMatch?.[1]?.toLowerCase();
  const normalizedUnit = rawUnit ? normalizeUnit(rawUnit) : "";
  const hasRecognizedUnit = Boolean(
    rawUnit &&
      (normalizedUnit !== rawUnit || knownStandardUnits.has(rawUnit) || knownCountUnits.has(rawUnit)),
  );
  const nameWithNotes = hasRecognizedUnit && unitMatch ? unitMatch[2] : remainder;
  const { itemName, notes } = splitNotes(nameWithNotes);

  return {
    itemName: itemName.toLowerCase(),
    quantity,
    unit: hasRecognizedUnit ? normalizedUnit : "each",
    notes,
  };
}
