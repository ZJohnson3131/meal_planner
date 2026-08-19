"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { createRecipe } from "@/app/actions/recipes";
import { RECIPE_INGESTED_EVENT, type RecipeIngestedData } from "@/components/forms/url-ingest-form";

type IngredientRow = {
  id: string;
  itemName: string;
  quantity: string;
  unit: string;
};

const minimumIngredientRows = 5;

function emptyIngredient(index: number): IngredientRow {
  return { id: `ingredient-${index}`, itemName: "", quantity: "", unit: "" };
}

function initialIngredients(): IngredientRow[] {
  return Array.from({ length: minimumIngredientRows }, (_, index) => emptyIngredient(index));
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving recipe…" : "Save recipe"}
    </button>
  );
}

/** A fully editable recipe form for manual entry and reviewed URL imports. */
export function RecipeForm() {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [servings, setServings] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ingestionStatus, setIngestionStatus] = useState("manual");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialIngredients);

  useEffect(() => {
    function applyImportedRecipe(event: Event) {
      const imported = (event as CustomEvent<RecipeIngestedData>).detail;
      if (!imported) return;

      setTitle(imported.title);
      setSourceUrl(imported.sourceUrl);
      setServings(imported.servings === null ? "" : String(imported.servings));
      setInstructions(imported.instructions);
      setIngestionStatus(imported.ingestionStatus);
      setIngredients(() => {
        const importedRows = imported.ingredients.map((ingredient, index) => ({
          id: `ingredient-${index}`,
          itemName: ingredient.itemName,
          quantity: ingredient.quantity === null ? "" : String(ingredient.quantity),
          unit: ingredient.unit ?? "",
        }));
        const requiredEmptyRows = Math.max(minimumIngredientRows - importedRows.length, 0);
        return [
          ...importedRows,
          ...Array.from({ length: requiredEmptyRows }, (_, index) => emptyIngredient(importedRows.length + index)),
        ];
      });
    }

    window.addEventListener(RECIPE_INGESTED_EVENT, applyImportedRecipe);
    return () => window.removeEventListener(RECIPE_INGESTED_EVENT, applyImportedRecipe);
  }, []);

  function updateIngredient(id: string, field: keyof Omit<IngredientRow, "id">, value: string) {
    setIngredients((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addIngredient() {
    setIngredients((rows) => [...rows, emptyIngredient(rows.length)]);
  }

  function removeIngredient(id: string) {
    setIngredients((rows) => (rows.length > minimumIngredientRows ? rows.filter((row) => row.id !== id) : rows));
  }

  return (
    <form action={createRecipe} className="space-y-6" noValidate>
      <input name="ingestionStatus" type="hidden" value={ingestionStatus} />
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-slate-950">Recipe details</legend>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-title">Title</label>
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-title" name="title" onChange={(event) => setTitle(event.target.value)} required value={title} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-source-url">Source URL</label>
          <input autoComplete="url" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-source-url" name="sourceUrl" onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/recipe" type="url" value={sourceUrl} />
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor="recipe-favorite">
            <input id="recipe-favorite" name="favorite" type="checkbox" />
            Favorite recipe
          </label>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-servings">Servings</label>
            <input className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2" id="recipe-servings" min="1" name="servings" onChange={(event) => setServings(event.target.value)} step="any" type="number" value={servings} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="recipe-instructions">Instructions</label>
          <textarea className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2" id="recipe-instructions" name="instructions" onChange={(event) => setInstructions(event.target.value)} value={instructions} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-slate-950">Ingredients</legend>
        <p className="text-sm text-slate-600">Add quantities and units where known. Blank rows are ignored.</p>
        <div className="space-y-3">
          {ingredients.map((ingredient, index) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]" key={ingredient.id}>
              <label className="text-sm text-slate-800">
                <span className="sr-only">Ingredient {index + 1} name</span>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="ingredientName" onChange={(event) => updateIngredient(ingredient.id, "itemName", event.target.value)} placeholder="Ingredient" value={ingredient.itemName} />
              </label>
              <label className="text-sm text-slate-800">
                <span className="sr-only">Ingredient {index + 1} quantity</span>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2" min="0" name="ingredientQuantity" onChange={(event) => updateIngredient(ingredient.id, "quantity", event.target.value)} placeholder="Quantity" step="any" type="number" value={ingredient.quantity} />
              </label>
              <label className="text-sm text-slate-800">
                <span className="sr-only">Ingredient {index + 1} unit</span>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="ingredientUnit" onChange={(event) => updateIngredient(ingredient.id, "unit", event.target.value)} placeholder="Unit" value={ingredient.unit} />
              </label>
              <button className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={ingredients.length <= minimumIngredientRows} onClick={() => removeIngredient(ingredient.id)} type="button">
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800" onClick={addIngredient} type="button">Add ingredient</button>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
