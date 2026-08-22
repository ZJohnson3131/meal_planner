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

const curatedRecipeId = "d9a4b5e9-59ea-421e-83d2-0a419644d154";
const adoptedRecipeId = "a4d0b833-953a-4432-a206-13ee1c3d7e44";

function adoptionFormData(value = curatedRecipeId) {
  const formData = new FormData();
  formData.set("curatedRecipeId", value);
  return formData;
}

describe("curated recipe adoption action", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.rpc.mockResolvedValue({ data: adoptedRecipeId, error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  test("adopts through the household-authorized RPC and refreshes dependent views", async () => {
    const { adoptCuratedRecipe } = await import("@/app/actions/curated-recipes");

    await expect(adoptCuratedRecipe(adoptionFormData())).resolves.toEqual({ recipeId: adoptedRecipeId });
    expect(mocks.rpc).toHaveBeenCalledWith("adopt_curated_recipe", {
      p_household_id: "household-123",
      p_curated_recipe_id: curatedRecipeId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/planner");
  });

  test("rejects malformed catalogue IDs before authentication or database access", async () => {
    const { adoptCuratedRecipe } = await import("@/app/actions/curated-recipes");

    await expect(adoptCuratedRecipe(adoptionFormData("forged-id"))).rejects.toThrow(
      "Dinner library recipe identifier is invalid",
    );
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test("does not revalidate when the RPC rejects access or returns an invalid copy ID", async () => {
    mocks.rpc.mockResolvedValue({ data: "not-a-uuid", error: new Error("not authorized") });
    const { adoptCuratedRecipe } = await import("@/app/actions/curated-recipes");

    await expect(adoptCuratedRecipe(adoptionFormData())).rejects.toThrow(
      "We could not add that dinner to your recipes",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
