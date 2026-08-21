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
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const pantryItemId = "9f11fef8-1b56-4a82-b5d6-a7a01a3055bb";

function pantryFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("itemName", "  Basmati rice  ");
  formData.set("quantity", "1.5");
  formData.set("unit", " kg ");
  formData.set("category", " Dry goods ");
  formData.set("expiryDate", "2026-12-01");
  Object.entries(overrides).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("pantry RPC actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  test("creates a normalized household item through the duplicate-safe RPC", async () => {
    const { createPantryItem } = await import("@/app/actions/pantry");
    await createPantryItem(pantryFormData());

    expect(mocks.rpc).toHaveBeenCalledWith("create_pantry_item", {
      p_category: "Dry goods",
      p_expiry_date: "2026-12-01",
      p_household_id: "household-123",
      p_item_name: "Basmati rice",
      p_quantity: 1.5,
      p_unit: "kg",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pantry");
  });

  test("returns a usable form state when duplicate-name creation is rejected", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("duplicate normalized name") });
    const { createPantryItem } = await import("@/app/actions/pantry");

    await expect(createPantryItem(
      { error: null, success: false },
      pantryFormData(),
    )).resolves.toEqual({
      error: "We could not add this pantry item. Check the details and try again.",
      success: false,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("updates with the optimistic version required to detect stale edits", async () => {
    const formData = pantryFormData({ category: "", expiryDate: "", version: "7" });
    formData.set("id", pantryItemId);
    const { updatePantryItem } = await import("@/app/actions/pantry");

    await updatePantryItem(formData);

    expect(mocks.rpc).toHaveBeenCalledWith("update_pantry_item", {
      p_category: undefined,
      p_expected_version: 7,
      p_expiry_date: undefined,
      p_item_id: pantryItemId,
      p_item_name: "Basmati rice",
      p_quantity: 1.5,
      p_unit: "kg",
    });
  });

  test("surfaces an optimistic-version conflict without revalidating stale state", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("Pantry item changed") });
    const formData = pantryFormData({ version: "2" });
    formData.set("id", pantryItemId);
    const { updatePantryItem } = await import("@/app/actions/pantry");

    await expect(updatePantryItem(formData)).rejects.toThrow(
      "We could not update that pantry item",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("deletes with the optimistic version and rejects missing versions before auth", async () => {
    const { deletePantryItem } = await import("@/app/actions/pantry");
    const formData = new FormData();
    formData.set("id", pantryItemId);
    formData.set("version", "3");

    await deletePantryItem(formData);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_pantry_item", {
      p_expected_version: 3,
      p_item_id: pantryItemId,
    });

    mocks.requireHousehold.mockClear();
    formData.delete("version");
    await expect(deletePantryItem(formData)).rejects.toThrow(
      "Pantry item identifier is invalid",
    );
    expect(mocks.requireHousehold).not.toHaveBeenCalled();
  });
});
