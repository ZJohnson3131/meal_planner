"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";
import { pantryItemSchema } from "@/lib/validation/pantry";

const pantryItemIdSchema = z.string().uuid();

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

/** Creates an inventory item in the authenticated user's active household. */
export async function createPantryItem(formData: FormData) {
  const { householdId } = await requireHousehold();
  const parsedItem = parsePantryItem(formData);
  if (!parsedItem.success) {
    throw new Error("Pantry item details are invalid");
  }

  const supabase = await createClient();
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
