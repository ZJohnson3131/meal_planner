import { normalizeSupportedUnit, roundQuantity } from "@/lib/domain/units";
import { RECIPE_IMPORT_LIMITS } from "@/lib/recipes/recipe-import-contract";

export type ParsedIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

export type ParsedIngredientLine = {
  ingredient: ParsedIngredient;
  reviewRequired: boolean;
};

function parseNumber(raw: string): number | null {
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    return denominator > 0 ? roundQuantity(whole + numerator / denominator) : null;
  }

  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator > 0 ? roundQuantity(numerator / denominator) : null;
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
export function parseIngredientLineForReview(line: string): ParsedIngredientLine {
  const normalizedLine = String(line ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wasTruncated = normalizedLine.length > RECIPE_IMPORT_LIMITS.ingredientLineCharacters;
  const trimmed = normalizedLine.slice(0, RECIPE_IMPORT_LIMITS.ingredientLineCharacters);

  if (!trimmed) {
    return {
      ingredient: { itemName: "", quantity: null, unit: null, notes: null },
      reviewRequired: true,
    };
  }

  const match = trimmed.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    const { itemName, notes } = splitNotes(trimmed);
    return {
      ingredient: { itemName: itemName.toLowerCase(), quantity: null, unit: null, notes },
      reviewRequired: true,
    };
  }

  const quantity = parseNumber(match[1]);
  const remainder = match[2].trim();
  if (quantity === null || !remainder) {
    return {
      ingredient: { itemName: remainder.toLowerCase(), quantity: null, unit: null, notes: null },
      reviewRequired: true,
    };
  }

  const unitMatch = remainder.match(/^([a-zA-Z]+)\.?\s+(.+)$/);
  const rawUnit = unitMatch?.[1]?.toLowerCase();
  const normalizedUnit = normalizeSupportedUnit(rawUnit);
  const hasRecognizedUnit = normalizedUnit !== null;
  const nameWithNotes = hasRecognizedUnit && unitMatch ? unitMatch[2] : remainder;
  const { itemName, notes } = splitNotes(nameWithNotes);

  return {
    ingredient: {
      itemName: itemName.toLowerCase(),
      quantity,
      unit: normalizedUnit ?? "each",
      notes,
    },
    // A multi-word remainder can begin with an unsupported unit (for example
    // "dessertspoon sugar") or with part of the ingredient name. Preserve the
    // whole text and require review instead of guessing which it is.
    reviewRequired: wasTruncated || Boolean(unitMatch && !hasRecognizedUnit),
  };
}

export function parseIngredientLine(line: string): ParsedIngredient {
  return parseIngredientLineForReview(line).ingredient;
}
