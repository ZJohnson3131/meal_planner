import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  dinnerMaybeSingle: vi.fn(),
  entryMaybeSingle: vi.fn(),
  recipeMaybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  update: vi.fn(),
  updateMaybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const entryId = "1a0f6c61-f1b7-4c2c-8475-4e4c6c72d769";
const recipeId = "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a";

function assignmentFormData() {
  const formData = new FormData();
  formData.set("plannedFor", "2026-06-15");
  formData.set("recipeId", recipeId);
  return formData;
}

function entryFormData() {
  const formData = new FormData();
  formData.set("entryId", entryId);
  return formData;
}

function equals(result: unknown) {
  return vi.fn().mockReturnValue(result);
}

function configureClient(options: { existingStatus?: "planned" | "skipped" | "completed"; recipe?: { id: string } | null; entry?: { id: string; status: "planned" | "skipped" | "completed" } | null } = {}) {
  const dinnerSlot = { id: "dinner-slot" };
  mocks.dinnerMaybeSingle.mockResolvedValue({ data: dinnerSlot, error: null });
  mocks.recipeMaybeSingle.mockResolvedValue({ data: options.recipe === undefined ? { id: recipeId } : options.recipe, error: null });
  mocks.entryMaybeSingle.mockResolvedValue({
    data: options.entry === undefined ? (options.existingStatus === undefined ? null : { id: entryId, status: options.existingStatus }) : options.entry,
    error: null,
  });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.updateMaybeSingle.mockResolvedValue({ data: { id: entryId }, error: null });

  const dinnerQuery = { select: vi.fn().mockReturnValue({ eq: equals({ eq: equals({ eq: equals({ maybeSingle: mocks.dinnerMaybeSingle }) }) }) }) };
  const recipeQuery = { select: vi.fn().mockReturnValue({ eq: equals({ eq: equals({ maybeSingle: mocks.recipeMaybeSingle }) }) }) };
  const existingQuery = { select: vi.fn().mockReturnValue({ eq: equals({ eq: equals({ eq: equals({ maybeSingle: mocks.entryMaybeSingle }) }) }) }) };
  const updateQuery = {
    update: mocks.update.mockReturnValue({
      eq: equals({
        eq: equals({
          eq: equals({ select: vi.fn().mockReturnValue({ maybeSingle: mocks.updateMaybeSingle }) }),
        }),
      }),
    }),
  };

  mocks.createClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "meal_slots") return dinnerQuery;
      if (table === "recipes") return recipeQuery;
      if (table === "meal_plan_entries") {
        return { ...existingQuery, ...updateQuery, upsert: mocks.upsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  });
}

describe("meal-plan server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    configureClient();
  });

  test("assigns a verified household recipe to the active household's Dinner slot", async () => {
    const { assignDinner } = await import("@/app/actions/meal-plans");

    await assignDinner(assignmentFormData());

    expect(mocks.upsert).toHaveBeenCalledWith({
      household_id: "household-123", meal_slot_id: "dinner-slot", recipe_id: recipeId,
      planned_for: "2026-06-15", status: "planned",
    }, { onConflict: "household_id,meal_slot_id,planned_for" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/planner");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/shopping");
  });

  test("rejects an assignment for a recipe outside the active household", async () => {
    configureClient({ recipe: null });
    const { assignDinner } = await import("@/app/actions/meal-plans");

    await expect(assignDinner(assignmentFormData())).rejects.toThrow("Recipe not found in the current household");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("marks only a current-household Dinner entry as skipped", async () => {
    configureClient({ entry: { id: entryId, status: "planned" } });
    const { markMealSkipped } = await import("@/app/actions/meal-plans");

    await markMealSkipped(entryFormData());

    expect(mocks.update).toHaveBeenCalledWith({ status: "skipped" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/planner");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/shopping");
  });

  test("restores a skipped dinner to planned", async () => {
    configureClient({ entry: { id: entryId, status: "skipped" } });
    const { markMealPlanned } = await import("@/app/actions/meal-plans");

    await markMealPlanned(entryFormData());

    expect(mocks.update).toHaveBeenCalledWith({ status: "planned" });
  });

  test("does not update a forged entry ID from another household", async () => {
    configureClient({ entry: null });
    const { markMealSkipped } = await import("@/app/actions/meal-plans");

    await expect(markMealSkipped(entryFormData())).rejects.toThrow("Meal plan entry not found in the current household");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
