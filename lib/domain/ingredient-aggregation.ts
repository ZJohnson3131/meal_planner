import { convertQuantity, normalizeUnit } from "@/lib/domain/units";

export type IngredientInput = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
};

export type AggregatedIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function aggregateIngredients(ingredients: IngredientInput[]): AggregatedIngredient[] {
  const grouped = new Map<string, AggregatedIngredient>();

  for (const ingredient of ingredients) {
    const itemName = normalizeName(ingredient.itemName);
    const unit = ingredient.unit ? normalizeUnit(ingredient.unit) : null;
    const key = itemName;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        itemName,
        quantity: ingredient.quantity,
        unit,
        reviewRequired: ingredient.quantity === null || unit === null,
      });
      continue;
    }

    if (existing.quantity === null || ingredient.quantity === null || !existing.unit || !unit) {
      existing.reviewRequired = true;
      continue;
    }

    const converted = convertQuantity(ingredient.quantity, unit, existing.unit);
    if (!converted.ok) {
      existing.reviewRequired = true;
      continue;
    }

    existing.quantity = Number((existing.quantity + converted.quantity).toFixed(4));
  }

  return Array.from(grouped.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}
