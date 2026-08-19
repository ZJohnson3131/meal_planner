import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  delete: vi.fn(),
  deleteEqHousehold: vi.fn(),
  deleteEqId: vi.fn(),
  deleteMaybeSingle: vi.fn(),
  existingEq: vi.fn(),
  existingIs: vi.fn(),
  existingLimit: vi.fn(),
  existingQuery: {},
  insert: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  update: vi.fn(),
  updateEqHousehold: vi.fn(),
  updateEqId: vi.fn(),
  updateMaybeSingle: vi.fn(),
  updateSelect: vi.fn(),
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

describe("pantry server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => {
      if ("mockReset" in mock && typeof mock.mockReset === "function") {
        mock.mockReset();
      }
    });
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    Object.assign(mocks.existingQuery, {
      eq: mocks.existingEq,
      is: mocks.existingIs,
      limit: mocks.existingLimit,
    });
    mocks.existingEq.mockReturnValue(mocks.existingQuery);
    mocks.existingIs.mockReturnValue(mocks.existingQuery);
    mocks.existingLimit.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.updateMaybeSingle.mockResolvedValue({ data: { id: pantryItemId }, error: null });
    mocks.updateSelect.mockReturnValue({ maybeSingle: mocks.updateMaybeSingle });
    mocks.updateEqHousehold.mockReturnValue({ select: mocks.updateSelect });
    mocks.updateEqId.mockReturnValue({ eq: mocks.updateEqHousehold });
    mocks.update.mockReturnValue({ eq: mocks.updateEqId });
    mocks.deleteMaybeSingle.mockResolvedValue({ data: { id: pantryItemId }, error: null });
    mocks.deleteEqHousehold.mockReturnValue({ select: mocks.updateSelect });
    mocks.deleteEqId.mockReturnValue({ eq: mocks.deleteEqHousehold });
    mocks.delete.mockReturnValue({ eq: mocks.deleteEqId });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "pantry_items") throw new Error(`Unexpected table: ${table}`);
        return {
          select: vi.fn(() => mocks.existingQuery),
          insert: mocks.insert,
          update: mocks.update,
          delete: mocks.delete,
        };
      }),
    });
  });

  test("creates a trimmed, household-scoped pantry item and revalidates the pantry", async () => {
    const { createPantryItem } = await import("@/app/actions/pantry");

    await createPantryItem(pantryFormData());

    expect(mocks.insert).toHaveBeenCalledWith({
      household_id: "household-123",
      item_name: "Basmati rice",
      quantity: 1.5,
      unit: "kg",
      category: "Dry goods",
      expiry_date: "2026-12-01",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pantry");
  });

  test("rejects invalid pantry details without accessing the database", async () => {
    const { createPantryItem } = await import("@/app/actions/pantry");

    await expect(createPantryItem(pantryFormData({ quantity: "-1" }))).rejects.toThrow(
      "Pantry item details are invalid",
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("treats an identical active-household item as an idempotent replay", async () => {
    mocks.existingLimit.mockResolvedValue({ data: [{ id: pantryItemId }], error: null });
    const { createPantryItem } = await import("@/app/actions/pantry");

    await createPantryItem(pantryFormData());

    expect(mocks.existingEq).toHaveBeenCalledWith("household_id", "household-123");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("updates only the active household's pantry item", async () => {
    const { updatePantryItem } = await import("@/app/actions/pantry");
    const formData = pantryFormData({ category: "", expiryDate: "" });
    formData.set("id", pantryItemId);

    await updatePantryItem(formData);

    expect(mocks.update).toHaveBeenCalledWith({
      item_name: "Basmati rice",
      quantity: 1.5,
      unit: "kg",
      category: null,
      expiry_date: null,
    });
    expect(mocks.updateEqId).toHaveBeenCalledWith("id", pantryItemId);
    expect(mocks.updateEqHousehold).toHaveBeenCalledWith("household_id", "household-123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pantry");
  });

  test("rejects an update when the item is not found in the active household", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { updatePantryItem } = await import("@/app/actions/pantry");
    const formData = pantryFormData();
    formData.set("id", pantryItemId);

    await expect(updatePantryItem(formData)).rejects.toThrow("Failed to update pantry item");

    expect(mocks.updateEqHousehold).toHaveBeenCalledWith("household_id", "household-123");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("deletes only the active household's pantry item", async () => {
    const { deletePantryItem } = await import("@/app/actions/pantry");
    const formData = new FormData();
    formData.set("id", pantryItemId);

    await deletePantryItem(formData);

    expect(mocks.delete).toHaveBeenCalledWith();
    expect(mocks.deleteEqId).toHaveBeenCalledWith("id", pantryItemId);
    expect(mocks.deleteEqHousehold).toHaveBeenCalledWith("household_id", "household-123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pantry");
  });
});
