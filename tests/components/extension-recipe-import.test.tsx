import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/recipes", () => ({ createRecipe: vi.fn() }));

import { ExtensionRecipeImport } from "@/components/forms/extension-recipe-import";

function setDraft(value: unknown) {
  window.location.hash = `draft=${btoa(JSON.stringify(value))}`;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ExtensionRecipeImport", () => {
  test("clears a valid fragment and prefills the normal editable recipe form", async () => {
    setDraft({
      title: "Visible recipe",
      sourceUrl: "https://recipes.example/visible",
      servings: 4,
      ingredients: [{ itemName: "Pasta", quantity: 400, unit: "g", notes: null }],
      instructions: "Cook and serve.",
    });

    render(<ExtensionRecipeImport />);

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Visible recipe"));
    expect(screen.getByLabelText("Ingredient 1 name")).toHaveValue("Pasta");
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
});
