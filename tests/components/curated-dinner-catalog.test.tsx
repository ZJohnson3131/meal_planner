import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  CuratedDinnerCatalog,
  type CuratedDinnerCatalogRecipe,
} from "@/components/recipes/curated-dinner-catalog";

const recipes: CuratedDinnerCatalogRecipe[] = [
  {
    id: "lentil-stew",
    title: "One-pot lentil stew",
    description: "A fast vegan dinner.",
    servings: 4,
    tags: [
      { slug: "vegan", label: "Vegan", category: "dietary" },
      { slug: "one-pot", label: "One-pot", category: "method" },
    ],
    sourceName: "Wikibooks",
    sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Lentil_Stew",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    adoptedRecipeId: null,
  },
  {
    id: "chicken-rice",
    title: "Chicken and rice",
    description: "A one-pot family dinner.",
    servings: 4,
    tags: [
      { slug: "chicken", label: "Chicken", category: "protein" },
      { slug: "one-pot", label: "One-pot", category: "method" },
    ],
    sourceName: "Wikibooks",
    sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Chicken_and_Rice",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    adoptedRecipeId: null,
  },
];

describe("CuratedDinnerCatalog", () => {
  test("filters dinners by search text and selected tags", async () => {
    const user = userEvent.setup();
    render(<CuratedDinnerCatalog adoptRecipe={vi.fn()} recipes={recipes} />);

    const list = screen.getByRole("list", { name: "Curated dinner recipes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    await user.type(screen.getByLabelText("Find a dinner"), "vegan");
    expect(within(list).getByRole("heading", { name: "One-pot lentil stew" })).toBeInTheDocument();
    expect(within(list).queryByRole("heading", { name: "Chicken and rice" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Find a dinner"));
    await user.click(screen.getByRole("button", { name: "One-pot" }));
    await user.click(screen.getByRole("button", { name: "Vegan" }));
    expect(screen.getByRole("button", { name: "One-pot" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Vegan" })).toHaveAttribute("aria-pressed", "true");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("heading", { name: "One-pot lentil stew" })).toBeInTheDocument();
  });

  test("confirms a successful adoption and presents a retryable error without marking a failed copy as added", async () => {
    const user = userEvent.setup();
    const adoptRecipe = vi.fn()
      .mockResolvedValueOnce({ recipeId: "household-lentil" })
      .mockRejectedValueOnce(new Error("database refused"));
    render(<CuratedDinnerCatalog adoptRecipe={adoptRecipe} recipes={recipes} />);

    const dinnerList = screen.getByRole("list", { name: "Curated dinner recipes" });
    const lentilCard = screen.getByRole("heading", { name: "One-pot lentil stew" }).closest("li");
    const chickenCard = screen.getByRole("heading", { name: "Chicken and rice" }).closest("li");
    expect(lentilCard).not.toBeNull();
    expect(chickenCard).not.toBeNull();

    await user.click(within(lentilCard!).getByRole("button", { name: "Add to my recipes" }));
    await waitFor(() => expect(adoptRecipe).toHaveBeenCalledWith("lentil-stew"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "One-pot lentil stew was added to your recipe library.",
    );
    expect(within(lentilCard!).getByRole("button", { name: "Added to library" })).toBeDisabled();

    await user.click(within(chickenCard!).getByRole("button", { name: "Add to my recipes" }));
    await waitFor(() => expect(adoptRecipe).toHaveBeenLastCalledWith("chicken-rice"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not add Chicken and rice. Please try again.",
    );
    expect(within(chickenCard!).getByRole("button", { name: "Add to my recipes" })).toBeEnabled();
    expect(within(dinnerList).getAllByRole("listitem")).toHaveLength(2);
  });
});
