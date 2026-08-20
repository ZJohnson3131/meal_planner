import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildDeductionPlan: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/domain/pantry-deductions", () => ({ buildDeductionPlan: mocks.buildDeductionPlan }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const entryId = "1a0f6c61-f1b7-4c2c-8475-4e4c6c72d769";

function entryFormData(extra: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("entryId", entryId);
  Object.entries(extra).forEach(([name, value]) => formData.set(name, value));
  return formData;
}

function dinnerClient(status: "planned" | "completed" | "skipped") {
  const dinnerSlot = { id: "dinner-slot" };
  const entry = { id: entryId, recipe_id: "recipe-1", status };
  const mealSlots = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: dinnerSlot, error: null }),
          }),
        }),
      }),
    }),
  };
  const entries = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: entry, error: null }),
          }),
        }),
      }),
    }),
  };

  return {
    from: vi.fn((table: string) => table === "meal_slots" ? mealSlots : entries),
    rpc: mocks.rpc,
  };
}

function planClient() {
  const ingredients = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
  const pantry = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
  const deductions = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    }),
  };
  return {
    from: vi.fn((table: string) => ({
      recipe_ingredients: ingredients,
      pantry_items: pantry,
      pantry_deductions: deductions,
    })[table]),
  };
}

describe("meal completion actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.buildDeductionPlan.mockReturnValue([]);
  });

  test("returns clean and review-required deductions separately for a planned household dinner", async () => {
    const clean = { recipeIngredientId: "ingredient-1", pantryItemId: "pantry-1", itemName: "Rice", quantity: 100, unit: "g", reviewRequired: false };
    const review = { recipeIngredientId: "ingredient-2", pantryItemId: null, itemName: "Oil", quantity: null, unit: null, reviewRequired: true, reviewReason: "No compatible pantry item" };
    mocks.buildDeductionPlan.mockReturnValue([clean, review]);
    mocks.createClient.mockResolvedValueOnce(dinnerClient("planned")).mockResolvedValueOnce(planClient());
    const { getMealCompletionPreview } = await import("@/app/actions/meal-plans");

    await expect(getMealCompletionPreview(entryId)).resolves.toEqual({ clean: [clean], review: [review] });
    expect(mocks.buildDeductionPlan).toHaveBeenCalledWith(expect.objectContaining({ mealPlanEntryId: entryId }));
  });

  test("delegates same-entry idempotency to the locked completion RPC", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(dinnerClient("completed"));
    const { completeMeal } = await import("@/app/actions/meal-plans");

    await expect(completeMeal(entryFormData())).resolves.toBeUndefined();
    expect(mocks.buildDeductionPlan).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_meal_plan_entry", {
      p_entry_id: entryId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pantry");
  });

  test("uses only the database-derived completion RPC and never sends a client-authored deduction plan", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(dinnerClient("planned"));
    const { completeMeal } = await import("@/app/actions/meal-plans");

    await expect(completeMeal(entryFormData())).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_meal_plan_entry", {
      p_entry_id: entryId,
    });
    expect(mocks.buildDeductionPlan).not.toHaveBeenCalled();
  });

  test("aggregates matching pantry deductions in the completion preview", async () => {
    mocks.buildDeductionPlan.mockReturnValue([
      { recipeIngredientId: "ingredient-1", pantryItemId: "pantry-1", itemName: "Rice", quantity: 100, unit: "g", reviewRequired: false, reviewReason: null },
      { recipeIngredientId: "ingredient-2", pantryItemId: "pantry-1", itemName: "Rice", quantity: 50, unit: "g", reviewRequired: false, reviewReason: null },
    ]);
    mocks.createClient.mockResolvedValueOnce(dinnerClient("planned")).mockResolvedValueOnce(planClient());
    const { getMealCompletionPreview } = await import("@/app/actions/meal-plans");

    await expect(getMealCompletionPreview(entryId)).resolves.toMatchObject({
      clean: [{ pantryItemId: "pantry-1", quantity: 150, unit: "g" }],
      review: [],
    });
  });

  test("reverses a completed dinner through the atomic reversal RPC", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(dinnerClient("completed"));
    const { reverseCompletedMeal } = await import("@/app/actions/meal-plans");

    await expect(
      reverseCompletedMeal(entryFormData({ confirmReversal: "true" })),
    ).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_meal_completion_deductions", {
      p_entry_id: entryId,
    });
  });

  test("requires explicit confirmation before a completed dinner can be reversed", async () => {
    const { reverseCompletedMeal } = await import("@/app/actions/meal-plans");

    await expect(reverseCompletedMeal(entryFormData())).rejects.toThrow("Confirm reversal before restoring a completed meal");
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
