"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { RecipeForm } from "@/components/forms/recipe-form";
import {
  RECIPE_INGESTED_EVENT,
  validatedRecipeIngestedData,
  type RecipeIngestedData,
} from "@/components/forms/url-ingest-form";
import { RECIPE_IMPORT_LIMITS } from "@/lib/recipes/recipe-import-contract";

const maximumEncodedDraftCharacters = Math.ceil(RECIPE_IMPORT_LIMITS.extensionDraftBytes * 4 / 3);

function decodeDraft(hash: string): RecipeIngestedData | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("draft");
  if (!encoded || encoded.length > maximumEncodedDraftCharacters) return null;

  try {
    const unpadded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const base64 = `${unpadded}${"=".repeat((4 - unpadded.length % 4) % 4)}`;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    if (bytes.byteLength > RECIPE_IMPORT_LIMITS.extensionDraftBytes) return null;

    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object") return null;
    return validatedRecipeIngestedData(
      { ...(value as Record<string, unknown>), ingestionStatus: "needs_review" },
      RECIPE_IMPORT_LIMITS.extensionIngredients,
    );
  } catch {
    return null;
  }
}

/** Reviews a bounded extension-provided draft after removing it from the URL. */
export function ExtensionRecipeImport() {
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const fragment = useMemo(() => (hydrated ? window.location.hash : ""), [hydrated]);
  const draft = useMemo(() => (fragment ? decodeDraft(fragment) : null), [fragment]);
  const error = fragment && !draft
    ? "The browser extension draft was missing or invalid. It may use an unsupported version; update the extension and try importing again."
    : null;

  useEffect(() => {
    if (!fragment) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (draft) window.dispatchEvent(new CustomEvent<RecipeIngestedData>(RECIPE_INGESTED_EVENT, { detail: draft }));
  }, [draft, fragment]);

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
          notes: ingredient.notes,
          quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
          unit: ingredient.unit ?? "",
        })),
      }} /> : null}
    </div>
  );
}
