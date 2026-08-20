import { expect, test } from "@playwright/test";

import { assertExpectedLocalSupabaseProject } from "./local-project-guard";

function encodeExtensionDraft(draft: unknown) {
  // Deliberately mirrors browser-extension/background.js: UTF-8 JSON bytes,
  // base64url conversion, then padding removal.
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("browser extension draft fragment renders an editable import form", async ({ page }) => {
  assertExpectedLocalSupabaseProject();
  test.setTimeout(60_000);
  const email = `extension-import-${Date.now()}@example.test`;
  const encoded = encodeExtensionDraft({
    recipeImportVersion: 1,
    title: "Extension lemon pasta",
    sourceUrl: "https://recipes.example/lemon-pasta",
    servings: 4,
    ingredients: [{ itemName: "Pasta", quantity: null, unit: null, notes: "visible package notes" }],
    instructions: "Cook pasta and toss with lemon.",
  });

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Extension import user");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("extension-import-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/recipes/import#draft=${encoded}`);
  await expect(page.getByRole("heading", { name: "Review browser import" })).toBeVisible();
  await expect(page.getByText("Imported 1 ingredient for review.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Extension lemon pasta");
  await expect(page.getByLabel("Source URL")).toHaveValue("https://recipes.example/lemon-pasta");
  await expect(page.getByLabel("Servings")).toHaveValue("4");
  await expect(page.getByLabel("Ingredient 1 name")).toHaveValue("Pasta");
  await expect(page.getByLabel("Ingredient 1 unit")).toHaveValue("");
  await expect(page.getByLabel("Ingredient 1 notes (optional)")).toHaveValue("visible package notes");
  await expect(page.getByLabel("Instructions")).toHaveValue("Cook pasta and toss with lemon.");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");

  await page.getByLabel("Title").fill("Edited lemon pasta");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
  const savedUrl = page.url();
  await expect(page.getByRole("heading", { name: "Edited lemon pasta", exact: true })).toBeVisible();
  await page.goto(savedUrl);
  await expect(page.getByText("Pasta (visible package notes)", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit recipe" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Edited lemon pasta");
  await expect(page.getByLabel("Ingredient 1 notes (optional)")).toHaveValue("visible package notes");
});
