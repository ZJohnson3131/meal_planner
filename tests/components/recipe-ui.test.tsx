import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/recipes", () => ({
  createRecipe: vi.fn(),
}));

import { RecipeForm } from "@/components/forms/recipe-form";
import { UrlIngestForm } from "@/components/forms/url-ingest-form";
import { RecipeList } from "@/components/recipes/recipe-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecipeList", () => {
  test("renders the empty state when the household has no recipes", () => {
    render(<RecipeList recipes={[]} />);

    expect(screen.getByText("No recipes yet. Add one to start planning dinners.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Recipes" })).not.toBeInTheDocument();
  });

  test("renders recipe details, favorites, source links, and detail links", () => {
    render(
      <RecipeList
        recipes={[
          { id: "favourite-id", title: "Lentil soup", favorite: true, source_url: "https://recipes.example/lentil-soup" },
          { id: "manual-id", title: "Toast", favorite: false, source_url: null },
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "Recipes" });
    expect(within(list).getByRole("heading", { name: "Lentil soup" })).toBeInTheDocument();
    expect(within(list).getByLabelText("Favorite recipe")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "View source" })).toHaveAttribute("href", "https://recipes.example/lentil-soup");
    expect(within(list).getByRole("link", { name: "View source" })).toHaveAttribute("target", "_blank");
    expect(within(list).getAllByRole("link", { name: "View details" })[0]).toHaveAttribute("href", "/recipes/favourite-id");
    expect(within(list).getAllByRole("link", { name: "View details" })[1]).toHaveAttribute("href", "/recipes/manual-id");
  });
});

describe("recipe URL review flow", () => {
  test("prefills the editable recipe form after importing a parsed recipe", async () => {
    const user = userEvent.setup();
    const importedRecipe = {
      title: "Weeknight pasta",
      sourceUrl: "https://recipes.example/weeknight-pasta",
      servings: 4,
      ingredients: [
        { itemName: "Pasta", quantity: 400, unit: "g", notes: null },
        { itemName: "Tomato", quantity: 2, unit: "each", notes: "ripe" },
      ],
      instructions: "Cook and serve.",
      ingestionStatus: "parsed" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => importedRecipe,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <UrlIngestForm />
        <RecipeForm />
      </>,
    );

    await user.type(screen.getByLabelText("Recipe URL"), importedRecipe.sourceUrl);
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    await screen.findByText("Imported: Weeknight pasta");
    expect(fetchMock).toHaveBeenCalledWith("/api/recipes/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: importedRecipe.sourceUrl }),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("Weeknight pasta");
    });
    expect(screen.getByLabelText("Source URL")).toHaveValue(importedRecipe.sourceUrl);
    expect(screen.getByLabelText("Servings")).toHaveValue(4);
    expect(screen.getByLabelText("Instructions")).toHaveValue("Cook and serve.");
    expect(screen.getByLabelText("Ingredient 1 name")).toHaveValue("Pasta");
    expect(screen.getByLabelText("Ingredient 1 quantity")).toHaveValue(400);
    expect(screen.getByLabelText("Ingredient 1 unit")).toHaveValue("g");
    expect(screen.getByLabelText("Ingredient 2 name")).toHaveValue("Tomato");
    expect(screen.getByDisplayValue("parsed")).toHaveAttribute("name", "ingestionStatus");
  });

  test("marks a reviewed import as manual when the user changes it before saving", async () => {
    const user = userEvent.setup();
    render(<RecipeForm />);

    window.dispatchEvent(new CustomEvent("meal-planner:recipe-ingested", {
      detail: {
        title: "Failed import draft",
        sourceUrl: "https://recipes.example/draft",
        servings: null,
        ingredients: [],
        instructions: "",
        ingestionStatus: "failed",
      },
    }));

    await waitFor(() => expect(screen.getByDisplayValue("failed")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Title"), " corrected");
    expect(screen.getByDisplayValue("manual")).toHaveAttribute("name", "ingestionStatus");
  });

  test("prefills a recipe edit form and sends edits to the supplied action", async () => {
    const saveChanges = vi.fn();
    render(
      <RecipeForm
        initialRecipe={{
          title: "Existing soup",
          sourceUrl: "https://recipes.example/soup",
          servings: 3,
          instructions: "Simmer.",
          favorite: true,
          ingestionStatus: "needs_review",
          ingredients: [{ itemName: "Tomatoes", quantity: "2", unit: "can" }],
        }}
        submitAction={saveChanges}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Existing soup");
    expect(screen.getByLabelText("Source URL")).toHaveValue("https://recipes.example/soup");
    expect(screen.getByLabelText("Servings")).toHaveValue(3);
    expect(screen.getByLabelText("Ingredient 1 name")).toHaveValue("Tomatoes");
    expect(screen.getByLabelText("Ingredient 1 unit")).toHaveValue("can");
    expect(screen.getByLabelText("Favorite recipe")).toBeChecked();
  });

  test("shows a review warning for a successful incomplete import", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Untitled recipe",
        sourceUrl: "https://recipes.example/incomplete",
        servings: null,
        ingredients: [],
        instructions: "",
        ingestionStatus: "needs_review",
      }),
    }));

    render(<UrlIngestForm />);

    await user.type(screen.getByLabelText("Recipe URL"), "https://recipes.example/incomplete");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    expect(await screen.findByText("Some details are missing, so this import needs review.")).toBeInTheDocument();
  });
});
