import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { assertExpectedLocalSupabaseProject } from "./local-project-guard";

const MVP_FLOW_TIMEOUT_MS = 120_000;
const TEST_WEEK_DATE = "2035-01-08";
const TEST_WEEK_END_DATE = "2035-01-14";

async function openPlannerWeek(page: Page, appNav: Locator) {
  await appNav.getByRole("link", { name: "Planner", exact: true }).click();
  const dateInput = page.getByLabel("Date in the week");
  await dateInput.fill(TEST_WEEK_DATE);
  await page.getByRole("button", { name: "View week" }).click();
  await expect(page.getByLabel("Recipe", { exact: true }).first()).toBeVisible();
}

test("landing page exposes auth entry points", async ({ page }) => {
  assertExpectedLocalSupabaseProject();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /plan dinners/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /create account/i }),
  ).toBeVisible();
});

test("a household can plan, shop for, and complete a dinner exactly once", async ({ page }) => {
  assertExpectedLocalSupabaseProject();
  // The first Server Action request can include a cold Next compilation in a
  // fresh local checkout. Keep the acceptance flow's assertion focused on its
  // observable success state rather than the default five-second expectation.
  test.setTimeout(MVP_FLOW_TIMEOUT_MS);
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `mvp-flow-${runId}@example.test`;
  const recipeTitle = `Rice bowl ${runId}`;

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("MVP flow user");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("mvp-flow-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const appNav = page.locator("nav");

  await appNav.getByRole("link", { name: "Pantry" }).click();
  await page.getByLabel("Item name").fill("Rice");
  await page.getByLabel("Quantity").fill("100");
  await page.getByLabel("Unit").selectOption("g");
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
  await page.getByLabel("Title").fill(recipeTitle);
  await page.getByLabel("Ingredient 1 name").fill("Rice");
  await page.getByLabel("Ingredient 1 quantity").fill("200");
  await page.getByLabel("Ingredient 1 unit").selectOption("g");
  await page.getByLabel("Ingredient 1 notes (optional)").fill("rinsed");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: recipeTitle, exact: true })).toBeVisible();
  await expect(page.getByText("200 g Rice (rinsed)", { exact: true })).toBeVisible();
  const recipeUrl = page.url();
  await page.getByRole("link", { name: "Edit recipe" }).click();
  await expect(page.getByLabel("Ingredient 1 notes (optional)")).toHaveValue("rinsed");
  await page.getByLabel("Ingredient 1 notes (optional)").fill("rinsed and drained");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(recipeUrl);
  await expect(page.getByText("200 g Rice (rinsed and drained)", { exact: true })).toBeVisible();

  await openPlannerWeek(page, appNav);
  await page.getByLabel("Recipe", { exact: true }).first().selectOption({ label: recipeTitle });
  await page.getByRole("button", { name: "Plan dinner" }).first().click();
  await expect(page.getByText("Planned", { exact: true }).first()).toBeVisible();

  await appNav.getByRole("link", { name: "Shopping" }).click();
  await page.getByLabel("Start date").fill(TEST_WEEK_DATE);
  await page.getByLabel("End date").fill(TEST_WEEK_END_DATE);
  await page.getByRole("button", { name: "Generate shopping list" }).click();
  await expect(page.getByRole("heading", { name: "Needed items" })).toBeVisible();
  await expect(page.getByText("rice", { exact: true })).toBeVisible();
  await expect(page.getByText("100 g", { exact: true })).toBeVisible();

  // The generated list identifies the 100 g shortfall. Record that purchase
  // in the pantry before completing the 200 g dinner so completion has a
  // clean, matched deduction rather than a review-only stock shortfall.
  await appNav.getByRole("link", { name: "Pantry" }).click();
  await page.getByLabel("Quantity for Rice").fill("200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Quantity for Rice")).toHaveValue("200");

  await openPlannerWeek(page, appNav);
  await page.getByRole("button", { name: "Complete dinner" }).click();
  await expect(page.getByRole("heading", { name: `Complete ${recipeTitle}`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pantry deductions" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm completion" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  await appNav.getByRole("link", { name: "Pantry" }).click();
  await expect(page.getByLabel("Quantity for Rice").first()).toHaveValue("0");
  await expect(page.getByText("Empty", { exact: true })).toBeVisible();
  await page.getByLabel("Show empty items").uncheck();
  await expect(page.getByLabel("Item name for Rice")).toHaveCount(0);
  await page.getByLabel("Show empty items").check();
  await expect(page.getByLabel("Item name for Rice")).toHaveCount(1);

  await openPlannerWeek(page, appNav);
  await page.getByLabel("I understand this restores the recorded pantry deductions where possible.").check();
  await page.getByRole("button", { name: "Reverse completion" }).click();
  await expect(page.getByText("Planned", { exact: true }).first()).toBeVisible();
  await appNav.getByRole("link", { name: "Pantry" }).click();
  await expect(page.getByLabel("Quantity for Rice").first()).toHaveValue("200");

  await openPlannerWeek(page, appNav);
  await page.getByRole("button", { name: "Complete dinner" }).click();
  await page.getByRole("button", { name: "Confirm completion" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await appNav.getByRole("link", { name: "Pantry" }).click();
  await expect(page.getByText("Empty", { exact: true })).toBeVisible();
});
