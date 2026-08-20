import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  dinnerMaybeSingle: vi.fn(),
  ingredientIn: vi.fn(),
  mealLte: vi.fn(),
  pantryEq: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  rpc: vi.fn(),
  unstableRethrow: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.unstableRethrow }));

const itemId = "f4f3fa64-84db-430e-bdf6-8e92bf281a6c";

function equals(result: unknown) {
  return vi.fn().mockReturnValue(result);
}

function rangeFormData() {
  const formData = new FormData();
  formData.set("startDate", "2026-06-15");
  formData.set("endDate", "2026-06-21");
  return formData;
}

function configureClient() {
  mocks.dinnerMaybeSingle.mockResolvedValue({ data: { id: "dinner-slot" }, error: null });
  mocks.mealLte.mockResolvedValue({
    data: [{ recipe_id: "recipe-rice" }, { recipe_id: "recipe-rice" }],
    error: null,
  });
  mocks.pantryEq.mockResolvedValue({
    data: [{ id: "pantry-rice", item_name: "Rice", quantity: 0.5, unit: "kg" }],
    error: null,
  });
  mocks.ingredientIn.mockResolvedValue({
    data: [{ recipe_id: "recipe-rice", item_name: "Rice", quantity: 1, unit: "kg" }],
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: "list-1", error: null });

  const dinnerQuery = { select: vi.fn().mockReturnValue({ eq: equals({ eq: equals({ eq: equals({ maybeSingle: mocks.dinnerMaybeSingle }) }) }) }) };
  const mealPlanQuery = { select: vi.fn().mockReturnValue({ eq: equals({ eq: equals({ eq: equals({ gte: equals({ lte: mocks.mealLte }) }) }) }) }) };
  const pantryQuery = { select: vi.fn().mockReturnValue({ eq: mocks.pantryEq }) };
  const ingredientQuery = { select: vi.fn().mockReturnValue({ in: mocks.ingredientIn }) };

  mocks.createClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "meal_slots") return dinnerQuery;
      if (table === "meal_plan_entries") return mealPlanQuery;
      if (table === "pantry_items") return pantryQuery;
      if (table === "recipe_ingredients") return ingredientQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: mocks.rpc,
  });
}

describe("shopping RPC actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    configureClient();
  });

  test("persists the entire generated snapshot transactionally", async () => {
    const { generateShoppingList } = await import("@/app/actions/shopping");
    await generateShoppingList(rangeFormData());

    expect(mocks.rpc).toHaveBeenCalledWith("create_shopping_list_with_items", {
      p_end_date: "2026-06-21",
      p_household_id: "household-123",
      p_items: [{
        deltaQuantity: 1.5,
        itemName: "rice",
        pantryQuantity: 0.5,
        requiredQuantity: 2,
        reviewReason: null,
        reviewRequired: false,
        unit: "kg",
      }],
      p_start_date: "2026-06-15",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/shopping");
  });

  test("does not leave a partial list visible when the transactional RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("item insert failed") });
    const { generateShoppingList } = await import("@/app/actions/shopping");

    await expect(generateShoppingList(rangeFormData())).rejects.toThrow(
      "We could not generate this shopping list",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("persists needed, checked, and dismissed statuses through the authorized RPC", async () => {
    const { setShoppingItemStatus } = await import("@/app/actions/shopping");

    for (const status of ["needed", "checked", "dismissed"] as const) {
      const formData = new FormData();
      formData.set("itemId", itemId);
      formData.set("status", status);
      await expect(setShoppingItemStatus({ error: null, success: false }, formData)).resolves.toEqual({
        error: null,
        status,
        success: true,
      });
      expect(mocks.rpc).toHaveBeenLastCalledWith("set_shopping_item_status", {
        p_item_id: itemId,
        p_status: status,
      });
    }
  });

  test("rejects malformed status updates before authentication", async () => {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("status", "purchased-by-attacker");
    const { setShoppingItemStatus } = await import("@/app/actions/shopping");

    await expect(setShoppingItemStatus({ error: null, success: false }, formData)).resolves.toEqual({
      error: "The shopping item update was invalid.",
      success: false,
    });
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
  });
});
