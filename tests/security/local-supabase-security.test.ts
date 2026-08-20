import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const env = loadEnv("test", process.cwd(), "");
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_DB_URL ?? env.SUPABASE_DB_URL;

const ownerEmail = "security-suite-owner@example.test";
const outsiderEmail = "security-suite-outsider@example.test";
const password = "local-security-suite-password";
const expectedProjectId = "task-3-supabase-docker";

let admin: SupabaseClient;
let owner: SupabaseClient;
let outsider: SupabaseClient;
let ownerHouseholdId: string;
let outsiderHouseholdId: string;
let recipeId: string;
let ingredientId: string;
let pantryItemId: string;
let entryId: string;
const createdUserIds: string[] = [];
let clientSequence = 0;

function assertLoopbackUrl(rawUrl: string, expectedPort: string, label: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is missing or invalid; refusing destructive local security tests`);
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback || url.port !== expectedPort) {
    throw new Error(`${label} must target the expected loopback port ${expectedPort}; received ${url.origin}`);
  }
}

function assertExpectedLocalProject() {
  assertLoopbackUrl(apiUrl, "54321", "NEXT_PUBLIC_SUPABASE_URL");
  if (databaseUrl) assertLoopbackUrl(databaseUrl, "54322", "SUPABASE_DB_URL");
  if (!anonKey || anonKey.startsWith("replace-with")) {
    throw new Error("A real local anon key is required; refusing destructive local security tests");
  }
  if (!serviceRoleKey || serviceRoleKey.startsWith("replace-with")) {
    throw new Error("A real local service-role key is required; refusing destructive local security tests");
  }
  const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (projectId !== expectedProjectId) {
    throw new Error(`Expected local Supabase project_id ${expectedProjectId}; refusing destructive tests`);
  }
}

function authenticatedClient(customFetch?: typeof fetch) {
  clientSequence += 1;
  return createClient(apiUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `meal-planner-local-security-${clientSequence}`,
    },
    ...(customFetch ? { global: { fetch: customFetch } } : {}),
  });
}

function createRequestBarrier(participants: number) {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });

  return async () => {
    arrivals += 1;
    if (arrivals === participants) release();
    await gate;
  };
}

async function barrierControlledOwnerClients(): Promise<[SupabaseClient, SupabaseClient]> {
  const { data, error } = await owner.auth.getSession();
  if (error || !data.session) throw error ?? new Error("Owner session missing for race test");
  const waitForBothRequests = createRequestBarrier(2);
  const nativeFetch = globalThis.fetch;
  const gatedFetch: typeof fetch = async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    if (new URL(requestUrl).pathname.startsWith("/rest/v1/rpc/")) {
      await waitForBothRequests();
    }
    return nativeFetch(input, init);
  };
  const clients: [SupabaseClient, SupabaseClient] = [
    authenticatedClient(gatedFetch),
    authenticatedClient(gatedFetch),
  ];
  await Promise.all(clients.map((client) => client.auth.setSession({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
  })));
  return clients;
}

async function removeExactLocalUser(email: string) {
  assertExpectedLocalProject();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email === email);
  if (existing) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);
    if (deleteError) throw deleteError;
  }
}

async function createLocalUser(email: string) {
  assertExpectedLocalProject();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: email.split("@")[0] },
  });
  if (error || !data.user) throw error ?? new Error("Local test user was not created");
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function signIn(client: SupabaseClient, email: string) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function singleHousehold(client: SupabaseClient) {
  const { data, error } = await client.from("households").select("id").single();
  if (error || !data) throw error ?? new Error("Local test household missing");
  return data.id as string;
}

async function createRecipe(
  client: SupabaseClient,
  householdId: string,
  title: string,
  itemName = "Rice",
) {
  const { data, error } = await client.rpc("create_recipe_with_ingredients", {
    p_household_id: householdId,
    p_ingredients: [{ itemName, notes: "dry", quantity: 1, unit: "each" }],
    p_recipe: {
      description: null,
      favorite: false,
      ingestionStatus: "manual",
      instructions: "Cook.",
      servings: 1,
      sourceUrl: null,
      title,
    },
  });
  if (error || !data) throw error ?? new Error("Recipe fixture missing");
  return data as string;
}

async function createRaceFixture(plannedFor: string, itemName: string) {
  const raceRecipeId = await createRecipe(
    owner,
    ownerHouseholdId,
    `${itemName} recipe`,
    itemName,
  );
  const pantry = await owner.rpc("create_pantry_item", {
    p_category: null,
    p_expiry_date: null,
    p_household_id: ownerHouseholdId,
    p_item_name: itemName,
    p_quantity: 10,
    p_unit: "each",
  });
  if (pantry.error || !pantry.data) throw pantry.error ?? new Error("Race pantry fixture missing");
  const entry = await owner.rpc("assign_dinner", {
    p_household_id: ownerHouseholdId,
    p_planned_for: plannedFor,
    p_recipe_id: raceRecipeId,
  });
  if (entry.error || !entry.data) throw entry.error ?? new Error("Race meal fixture missing");
  return { entryId: entry.data as string, recipeId: raceRecipeId };
}

beforeAll(async () => {
  assertExpectedLocalProject();
  admin = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await removeExactLocalUser(ownerEmail);
  await removeExactLocalUser(outsiderEmail);
  await createLocalUser(ownerEmail);
  await createLocalUser(outsiderEmail);

  owner = authenticatedClient();
  outsider = authenticatedClient();
  await signIn(owner, ownerEmail);
  await signIn(outsider, outsiderEmail);
  ownerHouseholdId = await singleHousehold(owner);
  outsiderHouseholdId = await singleHousehold(outsider);
  recipeId = await createRecipe(owner, ownerHouseholdId, "Security suite recipe");

  const { data: ingredients, error: ingredientError } = await owner
    .from("recipe_ingredients").select("id").eq("recipe_id", recipeId);
  if (ingredientError || ingredients?.length !== 1) throw ingredientError ?? new Error("Ingredient fixture missing");
  ingredientId = ingredients[0].id;

  const pantry = await owner.rpc("create_pantry_item", {
    p_category: null,
    p_expiry_date: null,
    p_household_id: ownerHouseholdId,
    p_item_name: "Rice",
    p_quantity: 2,
    p_unit: "each",
  });
  if (pantry.error || !pantry.data) throw pantry.error ?? new Error("Pantry fixture missing");
  pantryItemId = pantry.data as string;

  const entry = await owner.rpc("assign_dinner", {
    p_household_id: ownerHouseholdId,
    p_planned_for: "2035-01-08",
    p_recipe_id: recipeId,
  });
  if (entry.error || !entry.data) throw entry.error ?? new Error("Meal fixture missing");
  entryId = entry.data as string;
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  assertExpectedLocalProject();
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
});

describe.sequential("explicit local Supabase security and integrity suite", () => {
  test("denies direct authenticated DML and cross-household reads", async () => {
    const directInsert = await owner.from("recipes").insert({
      household_id: ownerHouseholdId,
      title: "Bypass",
      instructions: "Should fail",
    });
    expect(directInsert.error).not.toBeNull();

    const directMealUpdate = await owner.from("meal_plan_entries").update({ status: "completed" }).eq("id", entryId);
    expect(directMealUpdate.error).not.toBeNull();

    const { data, error } = await outsider.from("recipes").select("id").eq("id", recipeId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("accepts valid transitions but denies forged and legacy completion RPCs", async () => {
    const skip = await owner.rpc("set_dinner_status", { p_entry_id: entryId, p_target_status: "skipped" });
    expect(skip.error).toBeNull();
    const restore = await owner.rpc("set_dinner_status", { p_entry_id: entryId, p_target_status: "planned" });
    expect(restore.error).toBeNull();

    const forged = await outsider.rpc("complete_meal_plan_entry", { p_entry_id: entryId });
    expect(forged.error).not.toBeNull();
    const legacy = await owner.rpc("apply_meal_completion_deductions", {
      p_entry_id: entryId,
      p_deductions: [],
    });
    expect(legacy.error).not.toBeNull();
  });

  test("rolls back recipe and shopping aggregates when any child value is invalid", async () => {
    const rollbackTitle = "Must roll back aggregate";
    const failedRecipe = await owner.rpc("create_recipe_with_ingredients", {
      p_household_id: ownerHouseholdId,
      p_ingredients: [
        { itemName: "Valid", notes: null, quantity: 1, unit: "each" },
        { itemName: "   ", notes: null, quantity: 1, unit: "each" },
      ],
      p_recipe: {
        description: null,
        favorite: false,
        ingestionStatus: "manual",
        instructions: "Cook.",
        servings: 1,
        sourceUrl: null,
        title: rollbackTitle,
      },
    });
    expect(failedRecipe.error).not.toBeNull();
    const { count: recipeCount } = await owner.from("recipes")
      .select("id", { count: "exact", head: true }).eq("title", rollbackTitle);
    expect(recipeCount).toBe(0);

    const { count: beforeLists } = await owner.from("shopping_lists")
      .select("id", { count: "exact", head: true });
    const failedList = await owner.rpc("create_shopping_list_with_items", {
      p_end_date: "2035-01-14",
      p_household_id: ownerHouseholdId,
      p_items: [{
        deltaQuantity: -1,
        itemName: "Invalid",
        pantryQuantity: 0,
        requiredQuantity: 1,
        reviewReason: null,
        reviewRequired: false,
        unit: "each",
      }],
      p_start_date: "2035-01-08",
    });
    expect(failedList.error).not.toBeNull();
    const { count: afterLists } = await owner.from("shopping_lists")
      .select("id", { count: "exact", head: true });
    expect(afterLists).toBe(beforeLists);
  });

  test("serializes same-entry completion and preserves exact idempotency", async () => {
    const [first, second] = await Promise.all([
      owner.rpc("complete_meal_plan_entry", { p_entry_id: entryId }),
      owner.rpc("complete_meal_plan_entry", { p_entry_id: entryId }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const { data: pantry } = await owner.from("pantry_items").select("quantity, version").eq("id", pantryItemId).single();
    expect(Number(pantry?.quantity)).toBe(1);
    expect(Number(pantry?.version)).toBe(2);
    const { count } = await owner.from("pantry_deductions").select("id", { count: "exact", head: true }).eq("meal_plan_entry_id", entryId);
    expect(count).toBe(1);
  });

  test("permits stable-ID recipe edits after completion and reversal while history remains intact", async () => {
    const completedEdit = await owner.rpc("update_recipe_with_ingredients", {
      p_ingredients: [{ id: ingredientId, itemName: "Rice", notes: "edited after completion", quantity: 1, unit: "each" }],
      p_recipe_id: recipeId,
      p_recipe: {
        description: null,
        favorite: false,
        ingestionStatus: "manual",
        instructions: "Cook.",
        servings: 1,
        sourceUrl: null,
        title: "Security suite recipe",
      },
    });
    expect(completedEdit.error).toBeNull();

    expect((await owner.rpc("reverse_meal_completion_deductions", { p_entry_id: entryId })).error).toBeNull();
    const edited = await owner.rpc("update_recipe_with_ingredients", {
      p_ingredients: [{ id: ingredientId, itemName: "Rice", notes: "rinsed", quantity: 1, unit: "each" }],
      p_recipe_id: recipeId,
      p_recipe: {
        description: null,
        favorite: false,
        ingestionStatus: "manual",
        instructions: "Cook.",
        servings: 1,
        sourceUrl: null,
        title: "Edited after reversal",
      },
    });
    expect(edited.error).toBeNull();

    const { data: history } = await owner.from("pantry_deductions")
      .select("recipe_ingredient_id,item_name,quantity,unit,status").eq("meal_plan_entry_id", entryId).single();
    expect(history).toMatchObject({
      recipe_ingredient_id: ingredientId,
      item_name: "Rice",
      quantity: 1,
      unit: "each",
      status: "reversed",
    });
  });

  test("rejects duplicate normalized names and stale pantry versions", async () => {
    const duplicate = await owner.rpc("create_pantry_item", {
      p_category: null,
      p_expiry_date: null,
      p_household_id: ownerHouseholdId,
      p_item_name: " rice ",
      p_quantity: 99,
      p_unit: "each",
    });
    expect(duplicate.error).not.toBeNull();

    const { data: pantry } = await owner.from("pantry_items").select("version").eq("id", pantryItemId).single();
    const currentVersion = Number(pantry?.version);
    const update = await owner.rpc("update_pantry_item", {
      p_category: null,
      p_expected_version: currentVersion,
      p_expiry_date: null,
      p_item_id: pantryItemId,
      p_item_name: "Rice",
      p_quantity: 3,
      p_unit: "each",
    });
    expect(update.error).toBeNull();
    const stale = await owner.rpc("update_pantry_item", {
      p_category: null,
      p_expected_version: currentVersion,
      p_expiry_date: null,
      p_item_id: pantryItemId,
      p_item_name: "Rice",
      p_quantity: 4,
      p_unit: "each",
    });
    expect(stale.error).not.toBeNull();
  });

  test("serializes stale pantry edits against meal deductions and protects units until reversal", async () => {
    const beansRecipeId = await createRecipe(owner, ownerHouseholdId, "Beans race recipe");
    const { data: beanIngredients } = await owner.from("recipe_ingredients").select("id").eq("recipe_id", beansRecipeId).single();
    await admin.from("recipe_ingredients").update({ item_name: "Beans" }).eq("id", beanIngredients!.id);
    const beansPantry = await owner.rpc("create_pantry_item", {
      p_category: null,
      p_expiry_date: null,
      p_household_id: ownerHouseholdId,
      p_item_name: "Beans",
      p_quantity: 2,
      p_unit: "each",
    });
    expect(beansPantry.error).toBeNull();
    const beansPantryId = beansPantry.data as string;
    const beansEntry = await owner.rpc("assign_dinner", {
      p_household_id: ownerHouseholdId,
      p_planned_for: "2035-01-09",
      p_recipe_id: beansRecipeId,
    });
    expect(beansEntry.error).toBeNull();

    const [completion, staleEdit] = await Promise.all([
      owner.rpc("complete_meal_plan_entry", { p_entry_id: beansEntry.data }),
      owner.rpc("update_pantry_item", {
        p_category: null,
      p_expected_version: 1,
        p_expiry_date: null,
        p_item_id: beansPantryId,
        p_item_name: "Beans",
        p_quantity: 5,
        p_unit: "each",
      }),
    ]);
    expect(completion.error).toBeNull();
    const { data: racedPantry } = await owner.from("pantry_items").select("quantity,version").eq("id", beansPantryId).single();
    if (staleEdit.error) {
      expect(Number(racedPantry?.quantity)).toBe(1);
      expect(Number(racedPantry?.version)).toBe(2);
    } else {
      expect(Number(racedPantry?.quantity)).toBe(4);
      expect(Number(racedPantry?.version)).toBe(3);
    }

    const unitChange = await owner.rpc("update_pantry_item", {
      p_category: null,
      p_expected_version: Number(racedPantry?.version),
      p_expiry_date: null,
      p_item_id: beansPantryId,
      p_item_name: "Beans",
      p_quantity: Number(racedPantry?.quantity),
      p_unit: "piece",
    });
    expect(unitChange.error).not.toBeNull();

    expect((await owner.rpc("reverse_meal_completion_deductions", { p_entry_id: beansEntry.data })).error).toBeNull();
    const { data: restored } = await owner.from("pantry_items").select("quantity,version").eq("id", beansPantryId).single();
    const allowedUnitChange = await owner.rpc("update_pantry_item", {
      p_category: null,
      p_expected_version: Number(restored?.version),
      p_expiry_date: null,
      p_item_id: beansPantryId,
      p_item_name: "Beans",
      p_quantity: Number(restored?.quantity),
      p_unit: "piece",
    });
    expect(allowedUnitChange.error).toBeNull();
  });

  test("serializes barrier-controlled assignment versus completion without reopening completed state", async () => {
    const plannedFor = "2035-02-01";
    const fixture = await createRaceFixture(plannedFor, "Assignment completion grain");
    const [assignmentClient, completionClient] = await barrierControlledOwnerClients();
    const [assignment, completion] = await Promise.all([
      assignmentClient.rpc("assign_dinner", {
        p_household_id: ownerHouseholdId,
        p_planned_for: plannedFor,
        p_recipe_id: fixture.recipeId,
      }),
      completionClient.rpc("complete_meal_plan_entry", { p_entry_id: fixture.entryId }),
    ]);

    expect(completion.error).toBeNull();
    expect(assignment.error === null || assignment.error.code === "55000").toBe(true);
    const { data: rows, error } = await owner.from("meal_plan_entries")
      .select("id,status,recipe_id").eq("household_id", ownerHouseholdId).eq("planned_for", plannedFor);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      id: fixture.entryId,
      recipe_id: fixture.recipeId,
      status: "completed",
    });
  });

  test("serializes barrier-controlled skip versus completion to exactly one terminal transition", async () => {
    const plannedFor = "2035-02-02";
    const fixture = await createRaceFixture(plannedFor, "Skip completion grain");
    const [skipClient, completionClient] = await barrierControlledOwnerClients();
    const [skip, completion] = await Promise.all([
      skipClient.rpc("set_dinner_status", {
        p_entry_id: fixture.entryId,
        p_target_status: "skipped",
      }),
      completionClient.rpc("complete_meal_plan_entry", { p_entry_id: fixture.entryId }),
    ]);

    expect([skip.error, completion.error].filter((error) => error === null)).toHaveLength(1);
    const { data: entry, error } = await owner.from("meal_plan_entries")
      .select("status").eq("id", fixture.entryId).single();
    expect(error).toBeNull();
    expect(["completed", "skipped"]).toContain(entry?.status);
    const { count: activeDeductions } = await owner.from("pantry_deductions")
      .select("id", { count: "exact", head: true })
      .eq("meal_plan_entry_id", fixture.entryId)
      .in("status", ["applied", "review_required"]);
    expect(activeDeductions).toBe(entry?.status === "completed" ? 1 : 0);
  });

  test("serializes barrier-controlled reversal versus assignment with no active deduction left", async () => {
    const plannedFor = "2035-02-03";
    const fixture = await createRaceFixture(plannedFor, "Reversal assignment grain");
    expect((await owner.rpc("complete_meal_plan_entry", { p_entry_id: fixture.entryId })).error).toBeNull();
    const replacementRecipeId = await createRecipe(
      owner,
      ownerHouseholdId,
      "Replacement race recipe",
      "Reversal assignment grain",
    );
    const [reversalClient, assignmentClient] = await barrierControlledOwnerClients();
    const [reversal, assignment] = await Promise.all([
      reversalClient.rpc("reverse_meal_completion_deductions", { p_entry_id: fixture.entryId }),
      assignmentClient.rpc("assign_dinner", {
        p_household_id: ownerHouseholdId,
        p_planned_for: plannedFor,
        p_recipe_id: replacementRecipeId,
      }),
    ]);

    expect(reversal.error).toBeNull();
    expect(assignment.error === null || assignment.error.code === "55000").toBe(true);
    const { data: entry, error } = await owner.from("meal_plan_entries")
      .select("id,status,recipe_id").eq("id", fixture.entryId).single();
    expect(error).toBeNull();
    expect(entry?.status).toBe("planned");
    expect([fixture.recipeId, replacementRecipeId]).toContain(entry?.recipe_id);
    const { count: activeDeductions } = await owner.from("pantry_deductions")
      .select("id", { count: "exact", head: true })
      .eq("meal_plan_entry_id", fixture.entryId)
      .in("status", ["applied", "review_required"]);
    expect(activeDeductions).toBe(0);
  });

  test("persists needed, checked, and dismissed shopping semantics and exports no provider surface", async () => {
    const list = await owner.rpc("create_shopping_list_with_items", {
      p_end_date: "2035-01-14",
      p_household_id: ownerHouseholdId,
      p_items: [{
        deltaQuantity: 1,
        itemName: "Milk",
        pantryQuantity: 0,
        requiredQuantity: 1,
        reviewReason: null,
        reviewRequired: false,
        unit: "l",
      }],
      p_start_date: "2035-01-08",
    });
    expect(list.error).toBeNull();
    const { data: item } = await owner.from("shopping_list_items").select("id,status").eq("shopping_list_id", list.data).single();
    expect(item?.status).toBe("needed");
    for (const expectedStatus of ["checked", "dismissed", "needed"] as const) {
      expect((await owner.rpc("set_shopping_item_status", { p_item_id: item!.id, p_status: expectedStatus })).error).toBeNull();
      const { data: persisted } = await owner.from("shopping_list_items").select("status").eq("id", item!.id).single();
      expect(persisted?.status).toBe(expectedStatus);
    }
  });

  test("prevents household and child reparenting even through service-role DML", async () => {
    const recipeReparent = await admin.from("recipes").update({ household_id: outsiderHouseholdId }).eq("id", recipeId);
    expect(recipeReparent.error).not.toBeNull();
    const outsiderRecipeId = await createRecipe(outsider, outsiderHouseholdId, "Outsider recipe");
    const childReparent = await admin.from("recipe_ingredients").update({ recipe_id: outsiderRecipeId }).eq("id", ingredientId);
    expect(childReparent.error).not.toBeNull();
  });

  test("enforces DB constraints, least privilege, and removal of shopping providers", async () => {
    const invalid = await admin.from("recipes").insert({
      household_id: ownerHouseholdId,
      title: "   ",
      instructions: "x",
    });
    expect(invalid.error).not.toBeNull();

    const unsupportedUnitName = `Unsupported unit ${crypto.randomUUID()}`;
    const unsupportedUnit = await admin.from("pantry_items").insert({
      household_id: ownerHouseholdId,
      item_name: unsupportedUnitName,
      quantity: 1,
      unit: "bucketful",
    });
    expect(unsupportedUnit.error?.code).toBe("23514");
    const { count: unsupportedUnitCount } = await admin.from("pantry_items")
      .select("id", { count: "exact", head: true }).eq("item_name", unsupportedUnitName);
    expect(unsupportedUnitCount).toBe(0);

    const sanitizedUrl = await admin.rpc("sanitize_recipe_source_url", {
      p_source_url: "https://recipes.example/soup?utm_source=test&token=secret&userEmail=a%40b.test#method",
    });
    expect(sanitizedUrl.error).toBeNull();
    expect(sanitizedUrl.data).toBe("https://recipes.example/soup?utm_source=test");
    const malformedPercentUrl = await admin.rpc("sanitize_recipe_source_url", {
      p_source_url: "https://recipes.example/soup?utm_source=test&bad=%GG&token=secret#method",
    });
    expect(malformedPercentUrl.error).toBeNull();
    expect(malformedPercentUrl.data).toBe("https://recipes.example/soup?utm_source=test");
    const hostlessUrl = await admin.rpc("sanitize_recipe_source_url", {
      p_source_url: "https:///hostless-recipe?token=secret",
    });
    expect(hostlessUrl.error).toBeNull();
    expect(hostlessUrl.data).toBeNull();

    const malformedPercentTitle = `Sanitized direct RPC ${crypto.randomUUID()}`;
    const malformedPercentRecipe = await owner.rpc("create_recipe_with_ingredients", {
      p_household_id: ownerHouseholdId,
      p_ingredients: [{ itemName: "Soup", notes: null, quantity: 1, unit: "each" }],
      p_recipe: {
        description: null,
        favorite: false,
        ingestionStatus: "manual",
        instructions: "Cook.",
        servings: 1,
        sourceUrl: "https://recipes.example/soup?utm_source=test&bad=%GG&token=secret#method",
        title: malformedPercentTitle,
      },
    });
    expect(malformedPercentRecipe.error).toBeNull();
    const { data: cleanedRecipe } = await owner.from("recipes")
      .select("source_url").eq("id", malformedPercentRecipe.data).single();
    expect(cleanedRecipe?.source_url).toBe("https://recipes.example/soup?utm_source=test");

    const hostlessTitle = `Rejected direct RPC ${crypto.randomUUID()}`;
    const hostlessRecipe = await owner.rpc("create_recipe_with_ingredients", {
      p_household_id: ownerHouseholdId,
      p_ingredients: [{ itemName: "Soup", notes: null, quantity: 1, unit: "each" }],
      p_recipe: {
        description: null,
        favorite: false,
        ingestionStatus: "manual",
        instructions: "Cook.",
        servings: 1,
        sourceUrl: "https:///hostless-recipe?token=secret",
        title: hostlessTitle,
      },
    });
    expect(hostlessRecipe.error).not.toBeNull();
    const { count: hostlessCount } = await owner.from("recipes")
      .select("id", { count: "exact", head: true }).eq("title", hostlessTitle);
    expect(hostlessCount).toBe(0);
    expect((await owner.rpc("sanitize_recipe_source_url", {
      p_source_url: "https://recipes.example/soup",
    })).error).not.toBeNull();

    const providers = await admin.from("shopping_providers").select("id");
    expect(providers.error).not.toBeNull();

    const anonymous = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    expect((await anonymous.from("recipes").select("id")).error).not.toBeNull();
    expect((await anonymous.rpc("complete_meal_plan_entry", { p_entry_id: entryId })).error).not.toBeNull();
  });
});
