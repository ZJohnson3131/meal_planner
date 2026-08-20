"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { createRecipe } from "@/app/actions/recipes";
import { RECIPE_INGESTED_EVENT, type RecipeIngestedData } from "@/components/forms/url-ingest-form";
import { SUPPORTED_COOKING_UNITS } from "@/lib/domain/units";

type IngredientRow = {
  ingredientId: string;
  itemName: string;
  notes: string;
  quantity: string;
  rowKey: string;
  unit: string;
};

export type RecipeFormIngredient = {
  id?: string;
  itemName: string;
  notes?: string | null;
  quantity: string;
  unit: string;
};

export type RecipeFormInitialRecipe = {
  title: string;
  sourceUrl?: string | null;
  servings?: number | string | null;
  instructions?: string | null;
  favorite?: boolean;
  ingestionStatus?: "manual" | "parsed" | "needs_review" | "failed";
  ingredients?: RecipeFormIngredient[];
};

type RecipeFormProps = {
  initialRecipe?: RecipeFormInitialRecipe;
  submitAction?: (formData: FormData) => void | Promise<void>;
};

const MINIMUM_INGREDIENT_ROWS = 5;
const supportedUnitSet = new Set<string>(SUPPORTED_COOKING_UNITS);

function emptyIngredient(rowKey: string): IngredientRow {
  return { ingredientId: "", itemName: "", notes: "", quantity: "", rowKey, unit: "" };
}

function initialIngredients(
  ingredients: RecipeFormIngredient[] = [],
  keyPrefix = "initial",
): IngredientRow[] {
  const rows = ingredients.map((ingredient, index) => ({
    ingredientId: ingredient.id ?? "",
    itemName: ingredient.itemName,
    notes: ingredient.notes ?? "",
    quantity: ingredient.quantity,
    rowKey: `${keyPrefix}-${index}`,
    unit: ingredient.unit,
  }));

  return [
    ...rows,
    ...Array.from(
      { length: Math.max(MINIMUM_INGREDIENT_ROWS - rows.length, 0) },
      (_, index) => emptyIngredient(`${keyPrefix}-empty-${rows.length + index}`),
    ),
  ];
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Saving recipe…" : "Save recipe"}
    </button>
  );
}

/** A fully editable recipe form for manual entry and reviewed URL imports. */
export function RecipeForm({ initialRecipe, submitAction = createRecipe }: RecipeFormProps) {
  const [title, setTitle] = useState(initialRecipe?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(initialRecipe?.sourceUrl ?? "");
  const [servings, setServings] = useState(initialRecipe?.servings === null || initialRecipe?.servings === undefined ? "" : String(initialRecipe.servings));
  const [instructions, setInstructions] = useState(initialRecipe?.instructions ?? "");
  const [favorite, setFavorite] = useState(initialRecipe?.favorite ?? false);
  const [ingestionStatus, setIngestionStatus] = useState(initialRecipe?.ingestionStatus ?? "manual");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() => initialIngredients(initialRecipe?.ingredients));

  function markManualAfterReviewEdit() {
    setIngestionStatus((status) => (status === "failed" || status === "needs_review" ? "manual" : status));
  }

  useEffect(() => {
    function applyImportedRecipe(event: Event) {
      const imported = (event as CustomEvent<RecipeIngestedData>).detail;
      if (!imported) return;

      setTitle(imported.title);
      setSourceUrl(imported.sourceUrl);
      setServings(imported.servings === null ? "" : String(imported.servings));
      setInstructions(imported.instructions);
      setIngestionStatus(imported.ingestionStatus);
      setIngredients(() => initialIngredients(imported.ingredients.map((ingredient) => ({
        itemName: ingredient.itemName,
        notes: ingredient.notes,
        quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
        unit: ingredient.unit ?? "",
      })), "imported"));
    }

    window.addEventListener(RECIPE_INGESTED_EVENT, applyImportedRecipe);
    return () => window.removeEventListener(RECIPE_INGESTED_EVENT, applyImportedRecipe);
  }, []);

  function updateIngredient(rowKey: string, field: "itemName" | "notes" | "quantity" | "unit", value: string) {
    markManualAfterReviewEdit();
    setIngredients((rows) => rows.map((row) => (row.rowKey === rowKey ? { ...row, [field]: value } : row)));
  }

  function addIngredient() {
    markManualAfterReviewEdit();
    setIngredients((rows) => [...rows, emptyIngredient(`added-${crypto.randomUUID()}`)]);
  }

  function removeIngredient(rowKey: string) {
    markManualAfterReviewEdit();
    setIngredients((rows) => rows.length > MINIMUM_INGREDIENT_ROWS ? rows.filter((row) => row.rowKey !== rowKey) : rows);
  }

  return (
    <form action={submitAction} className="space-y-6" noValidate>
      <input name="ingestionStatus" type="hidden" value={ingestionStatus} />
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-slate-950">Recipe details</legend>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-title">Title</label>
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-title" name="title" onChange={(event) => { markManualAfterReviewEdit(); setTitle(event.target.value); }} required value={title} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-source-url">Source URL</label>
          <input autoComplete="url" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-source-url" name="sourceUrl" onChange={(event) => { markManualAfterReviewEdit(); setSourceUrl(event.target.value); }} placeholder="https://example.com/recipe" type="url" value={sourceUrl} />
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor="recipe-favorite">
            <input checked={favorite} id="recipe-favorite" name="favorite" onChange={(event) => { markManualAfterReviewEdit(); setFavorite(event.target.checked); }} type="checkbox" />
            Favorite recipe
          </label>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-servings">Servings</label>
            <input className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2" id="recipe-servings" min="1" name="servings" onChange={(event) => { markManualAfterReviewEdit(); setServings(event.target.value); }} step="any" type="number" value={servings} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-instructions">Instructions</label>
          <textarea className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-instructions" name="instructions" onChange={(event) => { markManualAfterReviewEdit(); setInstructions(event.target.value); }} value={instructions} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-slate-950">Ingredients</legend>
        <p className="text-sm text-slate-600">Add quantities and units where known. Keep imported notes, and review any unsupported unit before saving. Blank rows are ignored.</p>
        <div className="space-y-3">
          {ingredients.map((ingredient, index) => {
            const unsupportedUnit = ingredient.unit !== "" && !supportedUnitSet.has(ingredient.unit);
            return (
              <fieldset className="rounded-md border border-slate-200 p-3" key={ingredient.rowKey}>
                <legend className="sr-only">Ingredient {index + 1}</legend>
                <input name="ingredientId" type="hidden" value={ingredient.ingredientId} />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
                  <label className="text-sm text-slate-800">
                    <span className="sr-only">Ingredient {index + 1} name</span>
                    <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="ingredientName" onChange={(event) => updateIngredient(ingredient.rowKey, "itemName", event.target.value)} placeholder="Ingredient" value={ingredient.itemName} />
                  </label>
                  <label className="text-sm text-slate-800">
                    <span className="sr-only">Ingredient {index + 1} quantity</span>
                    <input className="w-full rounded-md border border-slate-300 px-3 py-2" min="0" name="ingredientQuantity" onChange={(event) => updateIngredient(ingredient.rowKey, "quantity", event.target.value)} placeholder="Quantity" step="any" type="number" value={ingredient.quantity} />
                  </label>
                  <label className="text-sm text-slate-800">
                    <span className="sr-only">Ingredient {index + 1} unit</span>
                    <select aria-describedby={unsupportedUnit ? `${ingredient.rowKey}-unit-review` : undefined} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" name="ingredientUnit" onChange={(event) => updateIngredient(ingredient.rowKey, "unit", event.target.value)} value={ingredient.unit}>
                      <option value="">Unit</option>
                      {unsupportedUnit ? <option value={ingredient.unit}>Review: {ingredient.unit}</option> : null}
                      {SUPPORTED_COOKING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </label>
                  <button className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={ingredients.length <= MINIMUM_INGREDIENT_ROWS} onClick={() => removeIngredient(ingredient.rowKey)} type="button">Remove</button>
                </div>
                {unsupportedUnit ? (
                  <p className="mt-2 text-xs text-amber-800" id={`${ingredient.rowKey}-unit-review`} role="status">“{ingredient.unit}” is not a supported unit. Choose a supported unit or clear it after reviewing the ingredient.</p>
                ) : null}
                <label className="mt-2 block text-sm text-slate-800">
                  <span className="font-medium">Ingredient {index + 1} notes <span className="font-normal text-slate-500">(optional)</span></span>
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="ingredientNotes" onChange={(event) => updateIngredient(ingredient.rowKey, "notes", event.target.value)} placeholder="Preparation, condition, or imported detail" value={ingredient.notes} />
                </label>
              </fieldset>
            );
          })}
        </div>
        <button className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800" onClick={addIngredient} type="button">Add ingredient</button>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
