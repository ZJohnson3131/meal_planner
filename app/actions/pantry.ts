"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";
import {
  pantryItemSchema,
  pantryItemVersionSchema,
} from "@/lib/validation/pantry";

const pantryItemIdSchema = z.string().uuid();

export type PantryItemFormState = {
  error: string | null;
  success: boolean;
};

function optionalFormText(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function parsePantryItem(formData: FormData) {
  return pantryItemSchema.safeParse({
    itemName: formData.get("itemName"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    category: optionalFormText(formData.get("category")),
    expiryDate: optionalFormText(formData.get("expiryDate")),
  });
}

async function insertPantryItem(formData: FormData) {
  const parsedItem = parsePantryItem(formData);
  if (!parsedItem.success) {
    throw new Error("Pantry item details are invalid");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_pantry_item", {
    p_category: parsedItem.data.category,
    p_expiry_date: parsedItem.data.expiryDate,
    p_household_id: householdId,
    p_item_name: parsedItem.data.itemName,
    p_quantity: parsedItem.data.quantity,
    p_unit: parsedItem.data.unit,
  });

  if (error) {
    throw new Error("Failed to create pantry item");
  }

  revalidatePath("/pantry");
}

/**
 * Creates an inventory item in the authenticated user's active household.
 * The overload also lets the same Server Action be passed directly to
 * `useActionState`, whose action signature includes the previous state.
 */
export async function createPantryItem(formData: FormData): Promise<void>;
export async function createPantryItem(
  previousState: PantryItemFormState,
  formData: FormData,
): Promise<PantryItemFormState>;
export async function createPantryItem(
  formDataOrPreviousState: FormData | PantryItemFormState,
  submittedFormData?: FormData,
): Promise<void | PantryItemFormState> {
  if (!submittedFormData) {
    await insertPantryItem(formDataOrPreviousState as FormData);
    return;
  }

  try {
    await insertPantryItem(submittedFormData);
    return { error: null, success: true };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: "We could not add this pantry item. Check the details and try again.",
      success: false,
    };
  }
}

/** Updates an inventory item only when it belongs to the active household. */
export async function updatePantryItem(formData: FormData) {
  const parsedId = pantryItemIdSchema.safeParse(formData.get("id"));
  const parsedVersion = pantryItemVersionSchema.safeParse(formData.get("version"));
  const parsedItem = parsePantryItem(formData);
  if (!parsedId.success || !parsedVersion.success || !parsedItem.success) {
    throw new Error("Pantry item details are invalid");
  }

  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_pantry_item", {
    p_category: parsedItem.data.category,
    p_expected_version: parsedVersion.data,
    p_expiry_date: parsedItem.data.expiryDate,
    p_item_id: parsedId.data,
    p_item_name: parsedItem.data.itemName,
    p_quantity: parsedItem.data.quantity,
    p_unit: parsedItem.data.unit,
  });

  if (error) {
    throw new Error("We could not update that pantry item. Refresh the pantry and try again.");
  }

  revalidatePath("/pantry");
}

/** Deletes an inventory item only when it belongs to the active household. */
export async function deletePantryItem(formData: FormData) {
  const parsedId = pantryItemIdSchema.safeParse(formData.get("id"));
  const parsedVersion = pantryItemVersionSchema.safeParse(formData.get("version"));
  if (!parsedId.success || !parsedVersion.success) {
    throw new Error("Pantry item identifier is invalid");
  }

  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_pantry_item", {
    p_expected_version: parsedVersion.data,
    p_item_id: parsedId.data,
  });

  if (error) {
    throw new Error("We could not delete that pantry item. Refresh the pantry and try again.");
  }

  revalidatePath("/pantry");
}
