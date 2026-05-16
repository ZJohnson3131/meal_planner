import { expect, test } from "@playwright/test";

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
