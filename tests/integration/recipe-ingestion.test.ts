import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseRecipeHtml } from "@/lib/recipes/recipe-ingestion";
import { RecipeFetchError, validateRecipeUrl } from "@/lib/recipes/safe-recipe-fetch";

describe("parseRecipeHtml", () => {
  it("extracts JSON-LD recipe fields", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Lemon Chicken",
          "recipeYield": "4 servings",
          "recipeIngredient": ["500g chicken breast", "1 lemon"],
          "recipeInstructions": [
            { "@type": "HowToStep", "text": "Cook chicken." },
            { "@type": "HowToStep", "text": "Add lemon." }
          ]
        }
      </script>
    `;

    expect(parseRecipeHtml(html, "https://example.test/lemon-chicken")).toEqual({
      title: "Lemon Chicken",
      sourceUrl: "https://example.test/lemon-chicken",
      servings: 4,
      ingredients: [
        { itemName: "chicken breast", quantity: 500, unit: "g", notes: null },
        { itemName: "lemon", quantity: 1, unit: "each", notes: null },
      ],
      instructions: "Cook chicken.\n\nAdd lemon.",
      ingestionStatus: "parsed",
    });
  });

  it("supports recipes nested in an @graph and HowToSection instructions", () => {
    const html = `<script type="application/ld+json">{
      "@graph": [{"@type":"Recipe","name":"Soup","recipeIngredient":["1 l stock"],
      "recipeInstructions":{"@type":"HowToSection","itemListElement":[{"text":"Simmer."}]}}]
    }</script>`;

    expect(parseRecipeHtml(html, "https://example.test/soup")).toMatchObject({
      title: "Soup",
      ingredients: [{ itemName: "stock", quantity: 1, unit: "l" }],
      instructions: "Simmer.",
      ingestionStatus: "parsed",
    });
  });

  it("returns needs_review and plain-text values when structured data is missing or incomplete", () => {
    expect(parseRecipeHtml("<html><title><b>No recipe</b></title></html>", "https://example.test")).toEqual({
      title: "No recipe",
      sourceUrl: "https://example.test/",
      servings: null,
      ingredients: [],
      instructions: "",
      ingestionStatus: "needs_review",
    });
  });

  it("strips markup and control characters from structured recipe text", () => {
    const html = `<script type="application/ld+json">{
      "@type": "Recipe",
      "name": "<img src=x onerror=alert(1)> Tomato Soup",
      "recipeIngredient": ["2 cans <b>tomatoes</b>\\u0000"],
      "recipeInstructions": "<strong>Simmer.</strong>"
    }</script>`;

    expect(parseRecipeHtml(html, "https://example.test/soup")).toMatchObject({
      title: "Tomato Soup",
      ingredients: [{ itemName: "tomatoes", quantity: 2, unit: "cans" }],
      instructions: "Simmer.",
    });
  });
});

describe("validateRecipeUrl", () => {
  it("accepts an HTTPS URL that resolves to a public literal IP address", async () => {
    await expect(validateRecipeUrl("https://8.8.8.8/recipe")).resolves.toMatchObject({
      url: expect.objectContaining({ href: "https://8.8.8.8/recipe" }),
      address: { address: "8.8.8.8", family: 4 },
    });
  });

  it.each([
    ["http://8.8.8.8/recipe", "non-HTTPS protocol"],
    ["ftp://8.8.8.8/recipe", "unsupported protocol"],
    ["https://username:password@8.8.8.8/recipe", "URL userinfo"],
    ["https://localhost/recipe", "localhost"],
    ["https://127.0.0.1/recipe", "IPv4 loopback"],
    ["https://10.0.0.1/recipe", "private IPv4"],
    ["https://192.168.1.1/recipe", "private IPv4 subnet"],
  ])("rejects %s (%s)", async (url) => {
    await expect(validateRecipeUrl(url)).rejects.toBeInstanceOf(RecipeFetchError);
  });

  it.each([
    ["ff02::1", "multicast"],
    ["fe80::1", "link-local"],
    ["::1", "loopback"],
    ["fd00::1", "unique-local"],
    ["2001:0db8::1", "documentation"],
    ["::ffff:192.0.2.1", "IPv4-mapped"],
  ])("rejects a hostname with an unsafe %s AAAA record (%s)", async (address) => {
    const lookupMock = vi.fn().mockResolvedValue([{ address, family: 6 }]);

    await expect(validateRecipeUrl("https://recipes.example/recipe", lookupMock)).rejects.toBeInstanceOf(RecipeFetchError);
    expect(lookupMock).toHaveBeenCalledWith("recipes.example", { all: true, verbatim: true });
  });

  it("accepts a hostname that resolves only to a global-unicast AAAA record", async () => {
    const lookupMock = vi.fn().mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);

    await expect(validateRecipeUrl("https://recipes.example/recipe", lookupMock)).resolves.toMatchObject({
      address: { address: "2606:4700:4700::1111", family: 6 },
    });
  });
});
