"use client";

import { FormEvent, useState } from "react";

export const RECIPE_INGESTED_EVENT = "meal-planner:recipe-ingested";

export type RecipeIngestedData = {
  title: string;
  sourceUrl: string;
  servings: number | null;
  ingredients: Array<{
    itemName: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
  }>;
  instructions: string;
  ingestionStatus: "parsed" | "needs_review" | "failed";
};

function isRecipeIngestedData(value: unknown): value is RecipeIngestedData {
  if (!value || typeof value !== "object") return false;

  const recipe = value as Partial<RecipeIngestedData>;
  return (
    typeof recipe.title === "string" &&
    typeof recipe.sourceUrl === "string" &&
    Array.isArray(recipe.ingredients) &&
    typeof recipe.instructions === "string" &&
    (recipe.ingestionStatus === "parsed" ||
      recipe.ingestionStatus === "needs_review" ||
      recipe.ingestionStatus === "failed")
  );
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

      if (!isRecipeIngestedData(data)) {
        setError("The imported recipe response was incomplete. Please enter the recipe manually.");
        return;
      }

      setRecipe(data);
      window.dispatchEvent(new CustomEvent<RecipeIngestedData>(RECIPE_INGESTED_EVENT, { detail: data }));
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
