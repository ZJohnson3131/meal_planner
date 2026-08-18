import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  dinnerMaybeSingle: vi.fn(),
  ingredientIn: vi.fn(),
  itemInsert: vi.fn(),
  mealLte: vi.fn(),
  pantryEq: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  shoppingListInsert: vi.fn(),
  shoppingListSingle: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function equals(result: unknown) {
  return vi.fn().mockReturnValue(result);
}

function rangeFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("startDate", "2026-06-15");
  formData.set("endDate", "2026-06-21");
  Object.entries(overrides).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

function configureClient() {
  mocks.dinnerMaybeSingle.mockResolvedValue({ data: { id: "dinner-slot" }, error: null });
  mocks.mealLte.mockResolvedValue({
    data: [{ recipe_id: "recipe-rice" }, { recipe_id: "recipe-rice" }, { recipe_id: "recipe-onion" }],
    error: null,
  });
  mocks.pantryEq.mockResolvedValue({
    data: [{ id: "pantry-rice", item_name: "Rice", quantity: 0.5, unit: "kg" }],
    error: null,
  });
  mocks.ingredientIn.mockResolvedValue({
    data: [
      { recipe_id: "recipe-rice", item_name: "Rice", quantity: 1, unit: "kg" },
      { recipe_id: "recipe-onion", item_name: "Onion", quantity: 2, unit: "each" },
    ],
    error: null,
  });
  mocks.shoppingListSingle.mockResolvedValue({ data: { id: "list-1" }, error: null });
  mocks.itemInsert.mockResolvedValue({ error: null });

  const dinnerQuery = {
    select: vi.fn().mockReturnValue({
      eq: equals({ eq: equals({ eq: equals({ maybeSingle: mocks.dinnerMaybeSingle }) }) }),
    }),
  };
  const mealPlanQuery = {
    select: vi.fn().mockReturnValue({
      eq: equals({
        eq: equals({
          eq: equals({ gte: equals({ lte: mocks.mealLte }) }),
        }),
      }),
    }),
  };
  const pantryQuery = { select: vi.fn().mockReturnValue({ eq: mocks.pantryEq }) };
  const ingredientQuery = { select: vi.fn().mockReturnValue({ in: mocks.ingredientIn }) };
  const shoppingListQuery = {
    insert: mocks.shoppingListInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({ single: mocks.shoppingListSingle }),
    }),
  };
  const itemQuery = { insert: mocks.itemInsert };

  mocks.createClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "meal_slots") return dinnerQuery;
      if (table === "meal_plan_entries") return mealPlanQuery;
      if (table === "pantry_items") return pantryQuery;
      if (table === "recipe_ingredients") return ingredientQuery;
      if (table === "shopping_lists") return shoppingListQuery;
      if (table === "shopping_list_items") return itemQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  });
}

describe("shopping server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    configureClient();
  });

  test("generates a household-scoped Dinner-only snapshot, including each planned occurrence", async () => {
    const { generateShoppingList } = await import("@/app/actions/shopping");

    await generateShoppingList(rangeFormData());

    expect(mocks.shoppingListInsert).toHaveBeenCalledWith({
      household_id: "household-123",
      name: "Shopping list 2026-06-15 to 2026-06-21",
      start_date: "2026-06-15",
      end_date: "2026-06-21",
      status: "active",
    });
    expect(mocks.ingredientIn).toHaveBeenCalledWith("recipe_id", ["recipe-rice", "recipe-onion"]);
    expect(mocks.itemInsert).toHaveBeenCalledWith([
      {
        shopping_list_id: "list-1", item_name: "onion", required_quantity: 2,
        pantry_quantity: 0, delta_quantity: 2, unit: "each", status: "needed",
        review_required: false, review_reason: null,
      },
      {
        shopping_list_id: "list-1", item_name: "rice", required_quantity: 2,
        pantry_quantity: 0.5, delta_quantity: 1.5, unit: "kg", status: "needed",
        review_required: false, review_reason: null,
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/shopping");
  });

  test("rejects invalid date ranges before accessing the database", async () => {
    const { generateShoppingList } = await import("@/app/actions/shopping");

    await expect(generateShoppingList(rangeFormData({ endDate: "2026-06-14" }))).rejects.toThrow(
      "Shopping-list dates are invalid",
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
