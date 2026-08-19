import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const env = loadEnv("test", process.cwd(), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRunAgainstLocalSupabase = Boolean(
  url && anonKey && serviceRoleKey && !anonKey.startsWith("replace-with") && !serviceRoleKey.startsWith("replace-with"),
);

const ownerEmail = "owner@example.test";
const outsiderEmail = "outsider@example.test";
const password = "household-access-test-password";

type Fixture = {
  ownerId: string;
  outsiderId: string;
  recipeId: string;
  pantryItemId: string;
  mealPlanEntryId: string;
  shoppingListId: string;
};

let admin: SupabaseClient;
let owner: SupabaseClient;
let outsider: SupabaseClient;
let fixture: Fixture;
const createdUserIds: string[] = [];

function authenticatedClient() {
  return createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function removeExistingUser(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email === email);
  if (existing) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);
    if (deleteError) throw deleteError;
  }
}

async function createUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: email.split("@")[0] },
  });
  if (error || !data.user) throw error ?? new Error("Test user was not created");
  return data.user.id;
}

async function expectHiddenAndUnchanged(
  table: "recipes" | "pantry_items" | "meal_plan_entries" | "shopping_lists",
  id: string,
  changedColumn: "title" | "item_name" | "name",
  originalValue: string,
) {
  const { data: selected, error: selectError } = await outsider.from(table).select("id").eq("id", id);
  expect(selectError).toBeNull();
  expect(selected).toEqual([]);

  const { data: updated, error: updateError } = await outsider
    .from(table)
    .update({ [changedColumn]: "outsider write attempt" })
    .eq("id", id)
    .select("id");
  expect(updateError).toBeNull();
  expect(updated).toEqual([]);

  const { data: ownerRow, error: ownerReadError } = await owner
    .from(table)
    .select(changedColumn)
    .eq("id", id)
    .single();
  expect(ownerReadError).toBeNull();
  expect((ownerRow as Record<string, unknown> | null)?.[changedColumn]).toBe(originalValue);
}

describe.skipIf(!canRunAgainstLocalSupabase)("household row-level access", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await removeExistingUser(ownerEmail);
    await removeExistingUser(outsiderEmail);

    const ownerId = await createUser(ownerEmail);
    createdUserIds.push(ownerId);
    const outsiderId = await createUser(outsiderEmail);
    createdUserIds.push(outsiderId);

    // A local service key is rightly treated as an auth-administration key by
    // some Supabase configurations, not as a blanket public-table bypass.
    // Bootstrap public fixtures through the owner's real authenticated client;
    // this both works with RLS enforced and better reflects the access model
    // under test.
    owner = authenticatedClient();
    const { error: ownerSignInError } = await owner.auth.signInWithPassword({ email: ownerEmail, password });
    if (ownerSignInError) throw ownerSignInError;

    const { data: household, error: householdError } = await owner
      .from("households")
      .select("id")
      .maybeSingle();
    if (householdError || !household) throw householdError ?? new Error("Owner household missing");

    const householdId = household.id;
    const { data: dinnerSlot, error: dinnerSlotError } = await owner
      .from("meal_slots")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", "Dinner")
      .eq("is_default", true)
      .single();
    if (dinnerSlotError || !dinnerSlot) throw dinnerSlotError ?? new Error("Dinner slot missing");

    const { data: recipe, error: recipeError } = await owner
      .from("recipes")
      .insert({ household_id: householdId, title: "Owner recipe", instructions: "Test only" })
      .select("id")
      .single();
    if (recipeError || !recipe) throw recipeError ?? new Error("Recipe fixture missing");

    const [{ data: pantryItem, error: pantryError }, { data: entry, error: entryError }, { data: shoppingList, error: shoppingError }] = await Promise.all([
      owner.from("pantry_items").insert({ household_id: householdId, item_name: "Owner rice", quantity: 1, unit: "kg" }).select("id").single(),
      owner.from("meal_plan_entries").insert({ household_id: householdId, meal_slot_id: dinnerSlot.id, recipe_id: recipe.id, planned_for: "2030-01-07" }).select("id").single(),
      owner.from("shopping_lists").insert({ household_id: householdId, name: "Owner list", start_date: "2030-01-07", end_date: "2030-01-13" }).select("id").single(),
    ]);
    if (pantryError || !pantryItem || entryError || !entry || shoppingError || !shoppingList) {
      throw pantryError ?? entryError ?? shoppingError ?? new Error("Household fixture setup failed");
    }

    fixture = { ownerId, outsiderId, recipeId: recipe.id, pantryItemId: pantryItem.id, mealPlanEntryId: entry.id, shoppingListId: shoppingList.id };
    outsider = authenticatedClient();
    const { error: signInError } = await outsider.auth.signInWithPassword({ email: outsiderEmail, password });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    if (!admin) return;
    await Promise.all(createdUserIds.map(async (userId) => {
      await admin.auth.admin.deleteUser(userId);
    }));
  });

  it("prevents an outsider from reading or updating every household-owned MVP record", async () => {
    await expectHiddenAndUnchanged("recipes", fixture.recipeId, "title", "Owner recipe");
    await expectHiddenAndUnchanged("pantry_items", fixture.pantryItemId, "item_name", "Owner rice");
    // meal entries have no independent display-name field; verify both their
    // invisibility and that a forged status update affects no row.
    const { data: entries } = await outsider.from("meal_plan_entries").select("id").eq("id", fixture.mealPlanEntryId);
    expect(entries).toEqual([]);
    const { data: updatedEntries } = await outsider.from("meal_plan_entries").update({ status: "skipped" }).eq("id", fixture.mealPlanEntryId).select("id");
    expect(updatedEntries).toEqual([]);
    const { data: ownerEntry } = await owner.from("meal_plan_entries").select("status").eq("id", fixture.mealPlanEntryId).single();
    expect(ownerEntry?.status).toBe("planned");
    await expectHiddenAndUnchanged("shopping_lists", fixture.shoppingListId, "name", "Owner list");
  });
});
