"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";
import { pantryItemSchema } from "@/lib/validation/pantry";

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
  const { householdId } = await requireHousehold();
  const parsedItem = parsePantryItem(formData);
  if (!parsedItem.success) {
    throw new Error("Pantry item details are invalid");
  }

  const supabase = await createClient();
  let existingItemQuery = supabase
    .from("pantry_items")
    .select("id")
    .eq("household_id", householdId)
    .eq("item_name", parsedItem.data.itemName)
    .eq("quantity", parsedItem.data.quantity)
    .eq("unit", parsedItem.data.unit);

  existingItemQuery = parsedItem.data.category
    ? existingItemQuery.eq("category", parsedItem.data.category)
    : existingItemQuery.is("category", null);
  existingItemQuery = parsedItem.data.expiryDate
    ? existingItemQuery.eq("expiry_date", parsedItem.data.expiryDate)
    : existingItemQuery.is("expiry_date", null);

  const { data: existingItems, error: existingItemError } = await existingItemQuery.limit(1);
  if (existingItemError) {
    throw new Error("Failed to check existing pantry items");
  }
  if (existingItems?.length) {
    return;
  }

  const { error } = await supabase.from("pantry_items").insert({
    household_id: householdId,
    item_name: parsedItem.data.itemName,
    quantity: parsedItem.data.quantity,
    unit: parsedItem.data.unit,
    category: parsedItem.data.category ?? null,
    expiry_date: parsedItem.data.expiryDate ?? null,
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
  } catch {
    return {
      error: "We could not add this pantry item. Check the details and try again.",
      success: false,
    };
  }
}

/** Updates an inventory item only when it belongs to the active household. */
export async function updatePantryItem(formData: FormData) {
  const { householdId } = await requireHousehold();
  const parsedId = pantryItemIdSchema.safeParse(formData.get("id"));
  const parsedItem = parsePantryItem(formData);
  if (!parsedId.success || !parsedItem.success) {
    throw new Error("Pantry item details are invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .update({
      item_name: parsedItem.data.itemName,
      quantity: parsedItem.data.quantity,
      unit: parsedItem.data.unit,
      category: parsedItem.data.category ?? null,
      expiry_date: parsedItem.data.expiryDate ?? null,
    })
    .eq("id", parsedId.data)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to update pantry item");
  }

  revalidatePath("/pantry");
}

/** Deletes an inventory item only when it belongs to the active household. */
export async function deletePantryItem(formData: FormData) {
  const { householdId } = await requireHousehold();
  const parsedId = pantryItemIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) {
    throw new Error("Pantry item identifier is invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", parsedId.data)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to delete pantry item");
  }

  revalidatePath("/pantry");
}
