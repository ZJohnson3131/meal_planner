import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  deleteRecipe: vi.fn(),
  insertIngredients: vi.fn(),
  insertRecipe: vi.fn(),
  recipeDeleteEq: vi.fn(),
  recipeInsertSelect: vi.fn(),
  recipeInsertSingle: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  requireHousehold: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({
  requireHousehold: mocks.requireHousehold,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

function recipeFormData() {
  const formData = new FormData();
  formData.set("title", "Weeknight pasta");
  formData.set("description", "A quick dinner");
  formData.set("sourceUrl", "https://example.com/pasta");
  formData.set("favorite", "on");
  formData.set("servings", "4");
  formData.set("instructions", "Boil the pasta.");
  formData.set("ingestionStatus", "parsed");
  formData.append("ingredientName", "Pasta");
  formData.append("ingredientQuantity", "500");
  formData.append("ingredientUnit", "g");
  formData.append("ingredientNotes", "dried");
  formData.append("ingredientName", "Olive oil");
  formData.append("ingredientQuantity", "2");
  formData.append("ingredientUnit", "tbsp");
  formData.append("ingredientNotes", "");
  return formData;
}

describe("createRecipe", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.recipeInsertSingle.mockResolvedValue({ data: { id: "recipe-123" }, error: null });
    mocks.recipeInsertSelect.mockReturnValue({ single: mocks.recipeInsertSingle });
    mocks.insertRecipe.mockReturnValue({ select: mocks.recipeInsertSelect });
    mocks.insertIngredients.mockResolvedValue({ error: null });
    mocks.recipeDeleteEq.mockReturnValue({ eq: mocks.recipeDeleteEq });
    mocks.deleteRecipe.mockReturnValue({ eq: mocks.recipeDeleteEq });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "recipes") {
          return { insert: mocks.insertRecipe, delete: mocks.deleteRecipe };
        }
        if (table === "recipe_ingredients") {
          return { insert: mocks.insertIngredients };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  test("inserts a household-scoped recipe and ordered ingredients before redirecting", async () => {
    const { createRecipe } = await import("@/app/actions/recipes");

    await expect(createRecipe(recipeFormData())).rejects.toThrow(
      "redirect:/recipes/recipe-123",
    );

    expect(mocks.insertRecipe).toHaveBeenCalledWith({
      household_id: "household-123",
      title: "Weeknight pasta",
      description: "A quick dinner",
      source_url: "https://example.com/pasta",
      favorite: true,
      servings: 4,
      instructions: "Boil the pasta.",
      ingestion_status: "parsed",
    });
    expect(mocks.insertIngredients).toHaveBeenCalledWith([
      {
        recipe_id: "recipe-123",
        item_name: "Pasta",
        quantity: 500,
        unit: "g",
        notes: "dried",
        display_order: 0,
      },
      {
        recipe_id: "recipe-123",
        item_name: "Olive oil",
        quantity: 2,
        unit: "tbsp",
        notes: null,
        display_order: 1,
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
  });

  test("rejects recipes without usable ingredients before database access", async () => {
    const formData = new FormData();
    formData.set("title", "Empty recipe");
    formData.set("instructions", "Nothing to cook.");
    formData.append("ingredientName", "   ");
    const { createRecipe } = await import("@/app/actions/recipes");

    await expect(createRecipe(formData)).rejects.toThrow("Recipe details are invalid");

    expect(mocks.requireHousehold).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  test("deletes the household-scoped recipe when ingredient insertion fails", async () => {
    mocks.insertIngredients.mockResolvedValue({ error: new Error("insert failed") });
    const { createRecipe } = await import("@/app/actions/recipes");

    await expect(createRecipe(recipeFormData())).rejects.toThrow(
      "Failed to create recipe ingredients",
    );

    expect(mocks.deleteRecipe).toHaveBeenCalledWith();
    expect(mocks.recipeDeleteEq).toHaveBeenNthCalledWith(1, "id", "recipe-123");
    expect(mocks.recipeDeleteEq).toHaveBeenNthCalledWith(
      2,
      "household_id",
      "household-123",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
