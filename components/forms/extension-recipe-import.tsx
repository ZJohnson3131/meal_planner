"use client";

import { useEffect, useState } from "react";

import { RecipeForm } from "@/components/forms/recipe-form";
import { RECIPE_INGESTED_EVENT, type RecipeIngestedData } from "@/components/forms/url-ingest-form";

const MAX_DRAFT_BYTES = 12_000;
const MAX_INGREDIENTS = 100;

function plainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : null;
}

function decodeDraft(hash: string): RecipeIngestedData | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("draft");
  if (!encoded || encoded.length > MAX_DRAFT_BYTES * 2) return null;

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    if (json.length > MAX_DRAFT_BYTES) return null;
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    const title = plainText(draft.title, 500);
    const sourceUrl = plainText(draft.sourceUrl, 2_048);
    const instructions = plainText(draft.instructions, MAX_DRAFT_BYTES);
    const servings = draft.servings === null ? null : Number(draft.servings);
    if (!title || !sourceUrl || instructions === null || !/^https?:\/\//i.test(sourceUrl)
      || (servings !== null && (!Number.isFinite(servings) || servings <= 0)) || !Array.isArray(draft.ingredients)
      || draft.ingredients.length > MAX_INGREDIENTS) return null;

    const ingredients = draft.ingredients.map((value) => {
      if (!value || typeof value !== "object") return null;
      const ingredient = value as Record<string, unknown>;
      const itemName = plainText(ingredient.itemName, 500);
      const quantity = ingredient.quantity === null ? null : Number(ingredient.quantity);
      const unit = ingredient.unit === null ? null : plainText(ingredient.unit, 100);
      const notes = ingredient.notes === null || ingredient.notes === undefined ? null : plainText(ingredient.notes, 2_000);
      if (!itemName || (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) || unit === null || notes === null && ingredient.notes != null) return null;
      return { itemName, quantity, unit, notes };
    });
    if (ingredients.some((ingredient) => ingredient === null)) return null;
    const validIngredients = ingredients.filter((ingredient): ingredient is NonNullable<typeof ingredient> => ingredient !== null);

    return { title, sourceUrl, servings, ingredients: validIngredients, instructions, ingestionStatus: "needs_review" };
  } catch {
    return null;
  }
}

function readInitialFragment(): { hasFragment: boolean; draft: RecipeIngestedData | null } {
  if (typeof window === "undefined") return { hasFragment: false, draft: null };
  const hash = window.location.hash;
  return { hasFragment: Boolean(hash), draft: hash ? decodeDraft(hash) : null };
}

/** Reviews a bounded extension-provided draft after removing it from the URL. */
export function ExtensionRecipeImport() {
  const [{ hasFragment, draft }] = useState(readInitialFragment);
  const error = hasFragment && !draft ? "The browser extension draft was missing or invalid. Please try importing again." : null;

  useEffect(() => {
    if (!hasFragment) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (draft) window.dispatchEvent(new CustomEvent<RecipeIngestedData>(RECIPE_INGESTED_EVENT, { detail: draft }));
  }, [draft, hasFragment]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="extension-import-heading" className="rounded-lg border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-semibold text-slate-950" id="extension-import-heading">Review browser import</h1>
        <p className="mt-2 text-sm text-slate-600">Review every field before saving. This draft came from the visible recipe page and has not been saved yet.</p>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        {draft ? <p className="mt-3 text-sm text-emerald-800">Imported {draft.ingredients.length} ingredient{draft.ingredients.length === 1 ? "" : "s"} for review.</p> : null}
      </section>
      {draft ? <RecipeForm initialRecipe={{
        title: draft.title,
        sourceUrl: draft.sourceUrl,
        servings: draft.servings,
        instructions: draft.instructions,
        ingestionStatus: draft.ingestionStatus,
        ingredients: draft.ingredients.map((ingredient) => ({
          itemName: ingredient.itemName,
          quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
          unit: ingredient.unit ?? "",
        })),
      }} /> : null}
    </div>
  );
}
