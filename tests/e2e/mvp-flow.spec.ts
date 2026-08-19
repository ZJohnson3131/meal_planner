import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
const hasLocalSupabaseConfig = Boolean(
  (env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  && (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  && !(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.startsWith("replace-with"),
);

test("landing page exposes auth entry points", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /plan dinners/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /create account/i }),
  ).toBeVisible();
});

test.skip(!hasLocalSupabaseConfig, "requires a configured local Supabase stack");

test("a household can plan, shop for, and complete a dinner exactly once", async ({ page }) => {
  // The first Server Action request can include a cold Next compilation in a
  // fresh local checkout. Keep the acceptance flow's assertion focused on its
  // observable success state rather than the default five-second expectation.
  test.setTimeout(90_000);
  const email = `mvp-flow-${Date.now()}@example.test`;

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("MVP flow user");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("mvp-flow-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const appNav = page.locator("nav");

  await appNav.getByRole("link", { name: "Pantry" }).click();
  // The pantry form is a client component; wait for its Server Action binding
  // before the first local submission to avoid a hydration-time double submit.
  await page.waitForTimeout(500);
  await page.getByLabel("Item name").fill("Rice");
  await page.getByLabel("Quantity").fill("100");
  await page.getByLabel("Unit").fill("g");
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Pantry item added.")).toBeVisible({ timeout: 15_000 });
  // The form exposes a local success state while the table is rendered by the
  // server. Reload before checking persisted inventory rather than coupling
  // this acceptance flow to client-router refresh timing.
  await page.reload();
  await expect(page.getByLabel("Item name for Rice")).toHaveCount(1);
  await expect(page.getByLabel("Item name for Rice")).toHaveValue("Rice");

  await appNav.getByRole("link", { name: "Recipes" }).click();
  await page.getByRole("link", { name: /add recipe/i }).click();
  await page.getByLabel("Title").fill("Rice bowl");
  await page.getByLabel("Ingredient 1 name").fill("Rice");
  await page.getByLabel("Ingredient 1 quantity").fill("200");
  await page.getByLabel("Ingredient 1 unit").fill("g");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Rice bowl" })).toBeVisible();

  await appNav.getByRole("link", { name: "Planner", exact: true }).click();
  await page.getByLabel("Recipe").first().selectOption({ label: "Rice bowl" });
  // This client component is first hydrated after the planner navigation.
  // Let its action binding attach before submitting the selected recipe.
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Plan dinner" }).first().click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText("Planned", { exact: true }).first()).toBeVisible();

  await appNav.getByRole("link", { name: "Shopping" }).click();
  await page.getByRole("button", { name: "Generate shopping list" }).click();
  await expect(page.getByRole("heading", { name: "Needed items" })).toBeVisible();
  await expect(page.getByText("rice", { exact: true })).toBeVisible();
  await expect(page.getByText("100 g", { exact: true })).toBeVisible();

  // The generated list identifies the 100 g shortfall. Record that purchase
  // in the pantry before completing the 200 g dinner so completion has a
  // clean, matched deduction rather than a review-only stock shortfall.
  await appNav.getByRole("link", { name: "Pantry" }).click();
  await page.waitForTimeout(500);
  await page.getByLabel("Quantity for Rice").fill("200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel("Quantity for Rice")).toHaveValue("200");

  await appNav.getByRole("link", { name: "Planner", exact: true }).click();
  // CompletionDialog is client-rendered after returning to the server-backed
  // planner page, so give its open handler time to hydrate before clicking.
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Complete dinner" }).click();
  await expect(page.getByRole("heading", { name: /complete rice bowl/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pantry deductions" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm completion" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  await appNav.getByRole("link", { name: "Pantry" }).click();
  await expect(page.getByLabel("Quantity for Rice").first()).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Complete dinner" })).toHaveCount(0);
});
