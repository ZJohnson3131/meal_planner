import {
  convertQuantity,
  normalizeSupportedUnit,
  normalizeUnit,
  roundQuantity,
} from "@/lib/domain/units";

export type IngredientInput = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
};

/**
 * A normalized source requirement retained when an aggregate cannot safely be
 * reduced to one quantity. This lets callers show or persist the complete set
 * of requirements instead of relying on a misleading partial total.
 */
export type IngredientRequirementComponent = IngredientInput;

export type AggregatedIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
  reviewReason?: string;
  sourceRequirements?: IngredientRequirementComponent[];
};

type NormalizedRequirement = IngredientRequirementComponent & {
  supportedUnit: ReturnType<typeof normalizeSupportedUnit>;
};

const AGGREGATION_REVIEW_PREFIX = "Cannot combine requirements";

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function normalizeRequirement(ingredient: IngredientInput): NormalizedRequirement {
  const unit = ingredient.unit ? normalizeUnit(ingredient.unit) || null : null;

  return {
    itemName: normalizeName(ingredient.itemName),
    quantity: ingredient.quantity,
    unit,
    supportedUnit: normalizeSupportedUnit(unit),
  };
}

function formatRequirement(requirement: IngredientRequirementComponent) {
  const quantity = requirement.quantity === null ? "unknown quantity" : String(requirement.quantity);
  return requirement.unit ? `${quantity} ${requirement.unit}` : `${quantity} unknown unit`;
}

function isValidQuantity(quantity: number | null): quantity is number {
  return quantity !== null && Number.isFinite(quantity) && quantity >= 0;
}

export function aggregateIngredients(ingredients: IngredientInput[]): AggregatedIngredient[] {
  const grouped = new Map<string, NormalizedRequirement[]>();

  for (const ingredient of ingredients) {
    const requirement = normalizeRequirement(ingredient);
    const requirements = grouped.get(requirement.itemName) ?? [];
    requirements.push(requirement);
    grouped.set(requirement.itemName, requirements);
  }

  return Array.from(grouped, ([itemName, requirements]) => {
    const targetUnit = requirements[0]?.supportedUnit ?? null;
    let total = 0;
    let canAggregate = targetUnit !== null;

    for (const requirement of requirements) {
      if (!isValidQuantity(requirement.quantity) || requirement.supportedUnit === null || targetUnit === null) {
        canAggregate = false;
        continue;
      }

      const converted = convertQuantity(requirement.quantity, requirement.supportedUnit, targetUnit);
      if (!converted.ok) {
        canAggregate = false;
        continue;
      }

      total += converted.quantity;
    }

    if (canAggregate) {
      return {
        itemName,
        quantity: roundQuantity(total),
        unit: targetUnit,
        reviewRequired: false,
      };
    }

    const sourceRequirements = requirements.map((requirement) => ({
      itemName: requirement.itemName,
      quantity: requirement.quantity,
      unit: requirement.unit,
    }));
    const unitsAreCompatible = targetUnit !== null && requirements.every((requirement) => {
      if (requirement.supportedUnit === null) {
        return false;
      }
      return convertQuantity(1, requirement.supportedUnit, targetUnit).ok;
    });

    return {
      itemName,
      quantity: null,
      unit: unitsAreCompatible ? targetUnit : null,
      reviewRequired: true,
      reviewReason: `${AGGREGATION_REVIEW_PREFIX}: ${sourceRequirements.map(formatRequirement).join("; ")}`,
      sourceRequirements,
    };
  }).sort((a, b) => a.itemName.localeCompare(b.itemName));
}
