import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/recipes", () => ({ createRecipe: vi.fn() }));

import { ExtensionRecipeImport } from "@/components/forms/extension-recipe-import";

function setDraft(value: unknown) {
  // Match browser-extension/background.js: UTF-8 bytes, base64url, and no
  // padding. This guards the real extension-to-page fragment contract.
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  window.location.hash = `draft=${encoded}`;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ExtensionRecipeImport", () => {
  test("clears a valid fragment and prefills the normal editable recipe form", async () => {
    setDraft({
      recipeImportVersion: 1,
      title: "Visible recipe",
      sourceUrl: "https://recipes.example/visible",
      servings: 4,
      // The extractor conservatively leaves units unknown rather than guessing.
      ingredients: [{ itemName: "Pasta", quantity: null, unit: null, notes: null }],
      instructions: "Cook and serve.",
    });

    render(<ExtensionRecipeImport />);

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Visible recipe"));
    expect(screen.getByLabelText("Ingredient 1 name")).toHaveValue("Pasta");
    expect(screen.getByLabelText("Ingredient 1 unit")).toHaveValue("");
    expect(screen.getByLabelText("Instructions")).toHaveValue("Cook and serve.");
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Imported 1 ingredient for review.")).toBeInTheDocument();
  });

  test("rejects an invalid draft and does not render a save form", async () => {
    window.location.hash = "draft=not-base64-json";
    render(<ExtensionRecipeImport />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The browser extension draft was missing or invalid.");
    expect(screen.queryByRole("button", { name: "Save recipe" })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  test("fails closed for an unversioned or future-version draft", async () => {
    setDraft({
      recipeImportVersion: 2,
      title: "Future recipe",
      sourceUrl: "https://recipes.example/future",
      servings: 2,
      ingredients: [],
      instructions: "Cook.",
    });

    render(<ExtensionRecipeImport />);

    expect(await screen.findByRole("alert")).toHaveTextContent("unsupported version");
    expect(screen.queryByRole("button", { name: "Save recipe" })).not.toBeInTheDocument();
  });
});
