import { describe, expect, test, vi } from "vitest";

import {
  assertRecipeImportTime,
  createRecipeImportBudget,
  createRecipeImportPayload,
  RecipeImportDeadlineError,
  remainingRecipeImportTime,
  sanitizeRecipeUrl,
  withinRecipeImportTime,
} from "@/lib/recipes/recipe-import-contract";

describe("recipe import wire and privacy contract", () => {
  test("versions payloads and redacts credentials, identity, signatures, and fragments", () => {
    const payload = createRecipeImportPayload({
      title: "Soup",
      sourceUrl: "https://recipes.example/soup?utm_source=test&access_token=secret&userEmail=a%40b.test&X-Amz-Signature=signed#method",
      servings: 2,
      ingredients: [],
      instructions: "Cook.",
      ingestionStatus: "parsed",
    });

    expect(payload.recipeImportVersion).toBe(1);
    expect(payload.sourceUrl).toBe("https://recipes.example/soup?utm_source=test");
  });

  test.each([
    "https://user:password@recipes.example/soup",
    "javascript:alert(1)",
    "not a url",
  ])("rejects an unsafe persisted URL: %s", (url) => {
    expect(sanitizeRecipeUrl(url)).toBeNull();
  });

  test("uses one aggregate deadline across async import stages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00Z"));
    const budget = createRecipeImportBudget(25);
    expect(remainingRecipeImportTime(budget)).toBe(25);

    const pending = withinRecipeImportTime(budget, new Promise<string>(() => {}));
    const rejection = expect(pending).rejects.toBeInstanceOf(RecipeImportDeadlineError);
    await vi.advanceTimersByTimeAsync(26);
    await rejection;
    expect(() => assertRecipeImportTime(budget)).toThrow(RecipeImportDeadlineError);
    vi.useRealTimers();
  });
});
