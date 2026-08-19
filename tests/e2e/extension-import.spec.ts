import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
const hasLocalSupabaseConfig = Boolean(
  (env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  && (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  && !(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.startsWith("replace-with"),
);

function encodeExtensionDraft(draft: unknown) {
  // Deliberately mirrors browser-extension/background.js: UTF-8 JSON bytes,
  // base64url conversion, then padding removal.
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test.skip(!hasLocalSupabaseConfig, "requires a configured local Supabase stack");

test("browser extension draft fragment renders an editable import form", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `extension-import-${Date.now()}@example.test`;
  const encoded = encodeExtensionDraft({
    title: "Extension lemon pasta",
    sourceUrl: "https://recipes.example/lemon-pasta",
    servings: 4,
    ingredients: [{ itemName: "Pasta", quantity: null, unit: null, notes: null }],
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
  await expect(page.getByLabel("Instructions")).toHaveValue("Cook pasta and toss with lemon.");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");

  await page.getByLabel("Title").fill("Edited lemon pasta");
  await expect(page.getByLabel("Title")).toHaveValue("Edited lemon pasta");
});
