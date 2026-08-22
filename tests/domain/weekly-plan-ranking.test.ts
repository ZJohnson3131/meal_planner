import { describe, expect, test } from "vitest";

import { rankSavedRecipes } from "@/lib/domain/weekly-plan-ranking";

const recipes = [
  { id: "2", title: "Bolognese", description: null, favorite: false, ingredientNames: ["beef"] },
  { id: "1", title: "Curry", description: null, favorite: true, ingredientNames: ["chickpeas"] },
  { id: "3", title: "Curry", description: null, favorite: false, ingredientNames: ["lentils"] },
];

describe("rankSavedRecipes", () => {
  test("applies the favourite boost only when the preference is enabled", () => {
    expect(rankSavedRecipes(recipes, { preferFavorites: false, dietaryExclusions: [] }).map((recipe) => recipe.id))
      .toEqual(["2", "1", "3"]);
    expect(rankSavedRecipes(recipes, { preferFavorites: true, dietaryExclusions: [] }).map((recipe) => recipe.id))
      .toEqual(["1", "2", "3"]);
  });

  test("removes known exclusion conflicts and marks uncertain survivors for review", () => {
    const ranked = rankSavedRecipes(recipes, { preferFavorites: true, dietaryExclusions: ["beef"] });

    expect(ranked.map((recipe) => recipe.id)).toEqual(["1", "3"]);
    expect(ranked.every((recipe) => recipe.reviewRequired)).toBe(true);
  });

  test("uses title then ID as a stable unique tie-breaker", () => {
    const ranked = rankSavedRecipes([
      { id: "b", title: "Pasta", description: null, favorite: false, ingredientNames: [] },
      { id: "a", title: "pasta", description: null, favorite: false, ingredientNames: [] },
    ], { preferFavorites: false, dietaryExclusions: [] });

    expect(ranked.map((recipe) => recipe.id)).toEqual(["a", "b"]);
    expect(new Set(ranked.map((recipe) => recipe.id)).size).toBe(ranked.length);
  });

  test("ranks goal and like matches ahead of neutral recipes and dislikes last", () => {
    const ranked = rankSavedRecipes([
      { id: "neutral", title: "Beef roast", description: null, favorite: false, ingredientNames: ["beef"] },
      { id: "liked", title: "Chickpea curry", description: null, favorite: false, ingredientNames: ["chickpeas"] },
      { id: "disliked", title: "Mushroom pasta", description: null, favorite: false, ingredientNames: ["mushrooms"] },
    ], {
      preferFavorites: false,
      dietaryExclusions: [],
      goals: ["vegetarian"],
      likesDislikes: "likes chickpeas, avoids mushrooms",
    });

    expect(ranked.map((recipe) => recipe.id)).toEqual(["liked", "neutral", "disliked"]);
    expect(ranked.find((recipe) => recipe.id === "disliked")?.reviewRequired).toBe(true);
  });

  test("flags saved recipes without timing metadata when a cooking limit is supplied", () => {
    const ranked = rankSavedRecipes([
      { id: "unknown", title: "Pasta", description: null, favorite: false, ingredientNames: [] },
      { id: "known", title: "Soup", description: null, favorite: false, ingredientNames: [], estimatedMinutes: 20 },
    ], {
      preferFavorites: false,
      dietaryExclusions: [],
      maxCookingMinutes: 30,
    });

    expect(ranked.map((recipe) => recipe.id)).toEqual(["known", "unknown"]);
    expect(ranked.find((recipe) => recipe.id === "unknown")?.reviewRequired).toBe(true);
  });
});
