import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  existingMaybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  requireHousehold: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const recipeId = "b7f9ae89-030c-48e8-a616-6f98415eaf00";
const ingredientId = "22b6054d-3faf-456a-922d-c5fc9d7d0e6e";

function recipeFormData(includeIds = false) {
  const formData = new FormData();
  formData.set("title", "Weeknight pasta");
  formData.set("description", "A quick dinner");
  formData.set("sourceUrl", "https://example.com/pasta");
  formData.set("favorite", "on");
  formData.set("servings", "4");
  formData.set("instructions", "Boil the pasta.");
  formData.set("ingestionStatus", "parsed");
  formData.append("ingredientId", includeIds ? ingredientId : "");
  formData.append("ingredientName", "Pasta");
  formData.append("ingredientQuantity", "500");
  formData.append("ingredientUnit", "g");
  formData.append("ingredientNotes", "dried");
  return formData;
}

function client() {
  const query = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mocks.existingMaybeSingle }),
      }),
    }),
  };
  return { from: vi.fn(() => query), rpc: mocks.rpc };
}

describe("transactional recipe actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.rpc.mockResolvedValue({ data: recipeId, error: null });
    mocks.existingMaybeSingle.mockResolvedValue({ data: { id: recipeId, description: "A quick dinner" }, error: null });
    mocks.createClient.mockResolvedValue(client());
  });

  test("creates recipe fields, notes, and ordered ingredients in one RPC", async () => {
    const { createRecipe } = await import("@/app/actions/recipes");
    await expect(createRecipe(recipeFormData())).rejects.toThrow(`redirect:/recipes/${recipeId}`);

    expect(mocks.rpc).toHaveBeenCalledWith("create_recipe_with_ingredients", {
      p_household_id: "household-123",
      p_ingredients: [{ itemName: "Pasta", notes: "dried", quantity: 500, unit: "g" }],
      p_recipe: {
        description: "A quick dinner",
        favorite: true,
        ingestionStatus: "parsed",
        instructions: "Boil the pasta.",
        servings: 4,
        sourceUrl: "https://example.com/pasta",
        title: "Weeknight pasta",
      },
    });
  });

  test("keeps stable ingredient IDs and notes when editing", async () => {
    const { updateRecipe } = await import("@/app/actions/recipes");
    await expect(updateRecipe(recipeId, recipeFormData(true))).rejects.toThrow(
      `redirect:/recipes/${recipeId}`,
    );

    expect(mocks.rpc).toHaveBeenCalledWith("update_recipe_with_ingredients", {
      p_ingredients: [{ id: ingredientId, itemName: "Pasta", notes: "dried", quantity: 500, unit: "g" }],
      p_recipe_id: recipeId,
      p_recipe: {
        description: "A quick dinner",
        favorite: true,
        ingestionStatus: "parsed",
        instructions: "Boil the pasta.",
        servings: 4,
        sourceUrl: "https://example.com/pasta",
        title: "Weeknight pasta",
      },
    });
  });

  test("does not redirect or revalidate when a transactional recipe RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("ingredient rejected") });
    const { createRecipe } = await import("@/app/actions/recipes");

    await expect(createRecipe(recipeFormData())).rejects.toThrow("We could not create this recipe");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("rejects an ingredient ID not shaped as a UUID before database access", async () => {
    const formData = recipeFormData(true);
    formData.set("ingredientId", "forged-id");
    const { updateRecipe } = await import("@/app/actions/recipes");

    await expect(updateRecipe(recipeId, formData)).rejects.toThrow("Recipe details are invalid");
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
  });
});
