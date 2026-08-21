"use client";

import { FormEvent, useState } from "react";

import {
  RECIPE_IMPORT_LIMITS,
  RECIPE_IMPORT_PAYLOAD_VERSION,
  sanitizeRecipeUrl,
  type RecipeImportIngredient,
  type RecipeImportPayloadV1,
} from "@/lib/recipes/recipe-import-contract";

export const RECIPE_INGESTED_EVENT = "meal-planner:recipe-ingested";

export type RecipeIngestedData = RecipeImportPayloadV1;

function boundedText(value: unknown, maximumCharacters: number, allowEmpty = true): string | null {
  if (typeof value !== "string" || value.length > maximumCharacters) return null;
  if (!allowEmpty && value.trim().length === 0) return null;
  return value;
}

function validatedIngredient(value: unknown): RecipeImportIngredient | null {
  if (!value || typeof value !== "object") return null;

  const ingredient = value as Record<string, unknown>;
  const itemName = boundedText(ingredient.itemName, RECIPE_IMPORT_LIMITS.titleCharacters, false);
  const quantity = ingredient.quantity;
  const unit = ingredient.unit === null
    ? null
    : boundedText(ingredient.unit, RECIPE_IMPORT_LIMITS.unitCharacters);
  const notes = ingredient.notes === null
    ? null
    : boundedText(ingredient.notes, RECIPE_IMPORT_LIMITS.ingredientLineCharacters);

  if (
    itemName === null
    || (quantity !== null && (
      typeof quantity !== "number"
      || !Number.isFinite(quantity)
      || quantity <= 0
    ))
    || unit === null && ingredient.unit !== null
    || notes === null && ingredient.notes !== null
  ) return null;

  return { itemName, notes, quantity: quantity as number | null, unit };
}

export function validatedRecipeIngestedData(
  value: unknown,
  maximumIngredients: number = RECIPE_IMPORT_LIMITS.ingredients,
): RecipeIngestedData | null {
  if (!value || typeof value !== "object") return null;

  const recipe = value as Record<string, unknown>;
  const title = boundedText(recipe.title, RECIPE_IMPORT_LIMITS.titleCharacters, false);
  const rawSourceUrl = boundedText(recipe.sourceUrl, RECIPE_IMPORT_LIMITS.sourceUrlCharacters);
  const sourceUrl = rawSourceUrl === "" ? "" : rawSourceUrl ? sanitizeRecipeUrl(rawSourceUrl) : null;
  const instructions = boundedText(recipe.instructions, RECIPE_IMPORT_LIMITS.instructionsCharacters);
  const servings = recipe.servings;
  const ingestionStatus = recipe.ingestionStatus;
  if (
    recipe.recipeImportVersion !== RECIPE_IMPORT_PAYLOAD_VERSION
    || title === null
    || sourceUrl === null
    || (sourceUrl === "" && ingestionStatus !== "failed")
    || instructions === null
    || (servings !== null && (
      typeof servings !== "number"
      || !Number.isFinite(servings)
      || servings <= 0
      || servings > RECIPE_IMPORT_LIMITS.servingsMaximum
    ))
    || !Array.isArray(recipe.ingredients)
    || recipe.ingredients.length > maximumIngredients
    || (ingestionStatus !== "parsed" && ingestionStatus !== "needs_review" && ingestionStatus !== "failed")
  ) return null;

  const ingredients = recipe.ingredients.map(validatedIngredient);
  if (ingredients.some((ingredient) => ingredient === null)) return null;

  return {
    recipeImportVersion: RECIPE_IMPORT_PAYLOAD_VERSION,
    title,
    sourceUrl,
    servings: servings as number | null,
    ingredients: ingredients.filter((ingredient): ingredient is RecipeImportIngredient => ingredient !== null),
    instructions,
    ingestionStatus,
  };
}

/**
 * Fetches untrusted recipe metadata for review. A successful result is also
 * broadcast to RecipeForm, which keeps the imported values editable before a
 * recipe is saved.
 */
export function UrlIngestForm() {
  const [url, setUrl] = useState("");
  const [recipe, setRecipe] = useState<RecipeIngestedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRecipe(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/recipes/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "We could not import that recipe. You can still enter it manually.";
        setError(message);
        return;
      }

      const validatedRecipe = validatedRecipeIngestedData(data);
      if (!validatedRecipe) {
        setError("The imported recipe response was unsupported or exceeded safe limits. Please enter the recipe manually.");
        return;
      }

      setRecipe(validatedRecipe);
      window.dispatchEvent(new CustomEvent<RecipeIngestedData>(RECIPE_INGESTED_EVENT, { detail: validatedRecipe }));
    } catch {
      setError("The recipe could not be reached. Check the URL and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="import-recipe-heading" className="rounded-lg border border-slate-200 p-5">
      <div className="space-y-1">
        <h2 id="import-recipe-heading" className="text-lg font-semibold text-slate-950">
          Import from a recipe URL
        </h2>
        <p className="text-sm text-slate-600">We will extract what we can. Review every field before saving.</p>
      </div>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-url">
            Recipe URL
          </label>
          <input
            autoComplete="url"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            id="recipe-url"
            name="recipeUrl"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/recipe"
            required
            type="url"
            value={url}
          />
        </div>
        <button
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Importing…" : "Import recipe"}
        </button>
      </form>

      {error ? (
        <p aria-live="polite" className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {recipe ? (
        <div aria-live="polite" className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-950">Imported: {recipe.title}</p>
          <p>
            {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"} found. The recipe form below has been filled for review.
          </p>
          {recipe.ingestionStatus !== "parsed" ? (
            <p className="mt-1 text-amber-800">Some details are missing, so this import needs review.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
