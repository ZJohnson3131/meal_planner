import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  rpc: vi.fn(),
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

describe("meal-plan RPC actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  test("assigns Dinner through the household-authorized transactional RPC", async () => {
    const { assignDinner } = await import("@/app/actions/meal-plans");
    await assignDinner(assignmentFormData());

    expect(mocks.rpc).toHaveBeenCalledWith("assign_dinner", {
      p_household_id: "household-123",
      p_planned_for: "2026-06-15",
      p_recipe_id: recipeId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/planner");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/shopping");
  });

  test.each([
    ["markMealSkipped", "skipped"],
    ["markMealPlanned", "planned"],
  ] as const)("%s delegates the locked transition to set_dinner_status", async (actionName, status) => {
    const actions = await import("@/app/actions/meal-plans");
    await actions[actionName](entryFormData());

    expect(mocks.rpc).toHaveBeenCalledWith("set_dinner_status", {
      p_entry_id: entryId,
      p_target_status: status,
    });
  });

  test("does not revalidate when assignment authorization or concurrency fails", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("transition rejected") });
    const { assignDinner } = await import("@/app/actions/meal-plans");

    await expect(assignDinner(assignmentFormData())).rejects.toThrow(
      "We could not assign that dinner",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("rejects malformed identifiers before authentication or database access", async () => {
    const { markMealSkipped } = await import("@/app/actions/meal-plans");
    const invalid = entryFormData();
    invalid.set("entryId", "forged");

    await expect(markMealSkipped(invalid)).rejects.toThrow(
      "Meal plan entry identifier is invalid",
    );
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
