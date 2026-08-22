"use client";

import { useMemo, useState, useTransition } from "react";

import type {
  GeneratedRecipeDraft,
  WeeklyPlanPreferences,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
  WeeklyPlanGoal,
} from "@/lib/domain/weekly-plan-types";
import { SUPPORTED_COOKING_UNITS } from "@/lib/domain/units";

type SavedRecipe = { id: string; title: string; favorite: boolean };

type WeeklyPlanGeneratorProps = {
  recipes: SavedRecipe[];
  weekStart: string;
  confirmWeeklyPlan: (input: unknown) => Promise<{ success: true }>;
  generateWeeklyPlanProposal: (input: unknown) => Promise<WeeklyPlanProposal>;
};

const GOALS = [
  ["simple", "Simple meals"],
  ["high_protein", "High protein"],
  ["budget_friendly", "Budget-friendly"],
  ["family_friendly", "Family-friendly"],
  ["vegetarian", "Vegetarian"],
  ["pantry_friendly", "Pantry-friendly"],
] as const;

type DraftIngredient = GeneratedRecipeDraft["ingredients"][number];
type ReviewItem = WeeklyPlanProposalItem & { accepted: boolean };

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function emptyIngredient(): DraftIngredient {
  return { itemName: "", quantity: null, unit: null, notes: null };
}

function updateDraft(item: ReviewItem, patch: Partial<GeneratedRecipeDraft>): ReviewItem {
  if (item.source !== "generated") return item;
  return { ...item, draft: { ...item.draft, ...patch } };
}

/** Collects preferences, then holds the proposal entirely in UI state until explicit confirmation. */
export function WeeklyPlanGeneratorClient({
  recipes,
  weekStart,
  confirmWeeklyPlan,
  generateWeeklyPlanProposal,
}: WeeklyPlanGeneratorProps) {
  const [proposal, setProposal] = useState<WeeklyPlanProposal | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isConfirming, startConfirming] = useTransition();
  const acceptedCount = useMemo(() => items.filter((item) => item.accepted).length, [items]);

  function generate(formData: FormData) {
    const selectedGoals = formData.getAll("goals").map(String) as WeeklyPlanGoal[];
    const preferences: WeeklyPlanPreferences = {
      weekStart,
      householdSize: Number(formData.get("householdSize")),
      dinnerCount: Number(formData.get("dinnerCount")),
      goals: selectedGoals,
      maxCookingMinutes: formData.get("maxCookingMinutes") ? Number(formData.get("maxCookingMinutes")) : null,
      dietaryExclusions: String(formData.get("dietaryExclusions") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      likesDislikes: String(formData.get("likesDislikes") ?? "").trim() || null,
      preferFavorites: formData.get("preferFavorites") === "on",
    };

    setError(null);
    setSuccess(null);
    startGenerating(async () => {
      try {
        const nextProposal = await generateWeeklyPlanProposal(preferences);
        setProposal(nextProposal);
        setItems(nextProposal.items.map((item) => ({ ...item, accepted: true })));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We could not generate a weekly proposal. Please try again.");
      }
    });
  }

  function replaceWithSaved(itemIndex: number, recipeId: string) {
    const savedRecipe = recipes.find((recipe) => recipe.id === recipeId);
    if (!savedRecipe) return;
    setItems((current) => current.map((item, index) => index === itemIndex ? {
      plannedFor: item.plannedFor,
      source: "saved",
      recipeId: savedRecipe.id,
      savedRecipe: {
        title: savedRecipe.title,
        description: null,
        servings: null,
        instructions: "",
        ingredients: [],
      },
      rationale: `Replaced with saved recipe: ${savedRecipe.title}.`,
      reviewRequired: false,
      accepted: item.accepted,
    } : item));
  }

  function confirm() {
    setError(null);
    setSuccess(null);
    startConfirming(async () => {
      try {
        await confirmWeeklyPlan({ weekStart, items: items.filter((item) => item.accepted) });
        setSuccess(`${acceptedCount} dinner${acceptedCount === 1 ? "" : "s"} saved to your plan.`);
        setProposal(null);
        setItems([]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Your plan was not finalised. Review it and try again.");
      }
    });
  }

  return (
    <section aria-labelledby="plan-my-week-heading" className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950" id="plan-my-week-heading">Plan my week</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">Build a dinner proposal for {displayDate(weekStart)} onward. Saved recipes are considered first; generated drafts are never saved until you confirm.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">Local Ollama only</span>
      </div>

      {!proposal ? (
        <form action={generate} className="mt-6 space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-800" htmlFor="weekly-plan-household-size">People to serve
              <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" defaultValue="2" id="weekly-plan-household-size" min="1" name="householdSize" required type="number" />
            </label>
            <label className="text-sm font-medium text-slate-800" htmlFor="weekly-plan-dinner-count">Dinners to plan
              <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" defaultValue="7" id="weekly-plan-dinner-count" max="7" min="1" name="dinnerCount" required type="number" />
            </label>
            <label className="text-sm font-medium text-slate-800" htmlFor="weekly-plan-cooking-time">Maximum cooking time <span className="font-normal text-slate-600">(optional)</span>
              <div className="mt-1 flex rounded-md shadow-sm"><input className="block w-full rounded-l-md border border-slate-300 bg-white px-3 py-2" id="weekly-plan-cooking-time" min="1" name="maxCookingMinutes" type="number" /><span className="inline-flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-600">min</span></div>
            </label>
          </div>
          <fieldset aria-describedby="weekly-plan-goals-help">
            <legend className="text-sm font-medium text-slate-800">Weekly goals <span className="font-normal text-slate-600">(optional)</span></legend>
            <p className="mt-1 text-sm text-slate-600" id="weekly-plan-goals-help">Leave these unselected if you have no particular meal preferences.</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {GOALS.map(([value, label]) => <label className="flex items-center gap-2 text-sm text-slate-700" key={value}><input className="size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" name="goals" type="checkbox" value={value} />{label}</label>)}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-800" htmlFor="weekly-plan-exclusions">Dietary exclusions <span className="font-normal text-slate-600">(optional, comma-separated)</span>
              <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" id="weekly-plan-exclusions" name="dietaryExclusions" placeholder="e.g. peanuts, shellfish" />
            </label>
            <label className="text-sm font-medium text-slate-800" htmlFor="weekly-plan-likes">Likes and dislikes <span className="font-normal text-slate-600">(optional)</span>
              <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" id="weekly-plan-likes" name="likesDislikes" placeholder="e.g. likes spicy food, avoids mushrooms" />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800"><input className="mt-1 size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" name="preferFavorites" type="checkbox" /> <span><span className="font-medium">Prefer favourite saved recipes</span><br /><span className="text-slate-600">Favourites receive a ranking boost, but are not forced when they conflict with your preferences.</span></span></label>
          <aside className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950" role="note"><strong>Check dietary and allergen suitability yourself.</strong> Suggestions are not nutrition, allergy, or medical advice. Review every ingredient and method before saving.</aside>
          <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={isGenerating} type="submit">{isGenerating ? "Generating proposal…" : "Generate dinner proposal"}</button>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          <div aria-live="polite" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-950">Review your proposal before anything is saved.</p>
            <p className="mt-1">Accept, edit, replace, or remove each dinner. {proposal.ollama.status !== "ready" ? `Local model status: ${proposal.ollama.status.replace("_", " ")}${proposal.ollama.message ? ` — ${proposal.ollama.message}` : ""}.` : "Generated drafts are editable before confirmation."}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item, index) => <ProposalCard item={item} index={index} key={`${item.plannedFor}-${index}`} onChange={(next) => setItems((current) => current.map((value, itemIndex) => itemIndex === index ? next : value))} onReplace={(recipeId) => replaceWithSaved(index, recipeId)} recipes={recipes} />)}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-5">
            <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={isConfirming || acceptedCount === 0} onClick={confirm} type="button">{isConfirming ? "Saving plan…" : `Confirm and save ${acceptedCount} dinner${acceptedCount === 1 ? "" : "s"}`}</button>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => { setProposal(null); setItems([]); }} type="button">Start over</button>
            <p className="text-sm text-slate-600">Confirmation creates accepted generated recipes and assigns accepted dinners to this week.</p>
          </div>
        </div>
      )}
      {error ? <p aria-live="assertive" className="mt-4 text-sm font-medium text-red-700" role="alert">{error}</p> : null}
      {success ? <p aria-live="polite" className="mt-4 text-sm font-medium text-emerald-800" role="status">{success}</p> : null}
    </section>
  );
}

function ProposalCard({ item, index, onChange, onReplace, recipes }: { item: ReviewItem; index: number; onChange: (item: ReviewItem) => void; onReplace: (recipeId: string) => void; recipes: SavedRecipe[] }) {
  const title = item.source === "generated" ? item.draft.title : item.savedRecipe.title;
  const badge = item.source === "generated" ? "Generated draft" : "Saved recipe";
  const badgeClass = item.source === "generated" ? "bg-violet-100 text-violet-900" : "bg-sky-100 text-sky-900";
  const draft = item.source === "generated" ? item.draft : undefined;
  const rationale = item.source === "generated" ? item.draft.rationale : item.rationale;
  const savedDetails = item.source === "saved" ? item.savedRecipe : null;
  return <article className={`rounded-lg border bg-white p-4 shadow-sm ${item.accepted ? "border-slate-200" : "border-slate-200 opacity-70"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{displayDate(item.plannedFor)}</p><h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>{badge}</span></div>
    {item.reviewRequired ? <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900">This suggestion needs extra review against your stated preferences.</p> : null}
    <p className="mt-3 text-sm leading-6 text-slate-700"><span className="font-medium text-slate-900">Why it fits:</span> {rationale}</p>
    {draft ? <DraftEditor draft={draft} onChange={(patch) => onChange(updateDraft(item, patch))} /> : savedDetails ? <SavedRecipeDetails recipe={savedDetails} /> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input checked={item.accepted} className="size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" onChange={(event) => onChange({ ...item, accepted: event.target.checked })} type="checkbox" />Accept this dinner</label>
      <label className="text-sm text-slate-700" htmlFor={`replace-${index}`}><span className="sr-only">Replace {title}</span><select className="rounded-md border border-slate-300 bg-white px-2 py-1.5" defaultValue="" id={`replace-${index}`} onChange={(event) => { if (event.target.value) onReplace(event.target.value); }}><option value="">Replace with saved recipe…</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.favorite ? "★ " : ""}{recipe.title}</option>)}</select></label>
      <button className="text-sm font-medium text-slate-700 underline underline-offset-2 hover:text-slate-950" onClick={() => onChange({ ...item, accepted: false })} type="button">Remove</button>
    </div>
  </article>;
}

function SavedRecipeDetails({ recipe }: { recipe: Extract<WeeklyPlanProposalItem, { source: "saved" }>["savedRecipe"] }) {
  return <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
    <p>{recipe.servings ? `${recipe.servings} servings` : "Servings not recorded"}{recipe.description ? ` · ${recipe.description}` : ""}</p>
    {recipe.ingredients.length > 0 ? <p className="mt-2"><span className="font-medium text-slate-900">Ingredients:</span> {recipe.ingredients.map((ingredient) => ingredient.itemName).join(", ")}</p> : null}
    {recipe.instructions ? <p className="mt-2 line-clamp-3"><span className="font-medium text-slate-900">Method:</span> {recipe.instructions}</p> : null}
    <p className="mt-2">This uses a recipe already saved in your library. You can replace it before confirmation.</p>
  </div>;
}

function DraftEditor({ draft, onChange }: { draft: GeneratedRecipeDraft; onChange: (patch: Partial<GeneratedRecipeDraft>) => void }) {
  const updateIngredient = (index: number, patch: Partial<DraftIngredient>) => onChange({ ingredients: draft.ingredients.map((ingredient, ingredientIndex) => ingredientIndex === index ? { ...ingredient, ...patch } : ingredient) });
  return <div className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-800">Recipe title<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" onChange={(event) => onChange({ title: event.target.value })} value={draft.title} /></label><label className="text-sm font-medium text-slate-800">Servings<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" min="1" onChange={(event) => onChange({ servings: Number(event.target.value) })} type="number" value={draft.servings} /></label><label className="text-sm font-medium text-slate-800">Cooking time <span className="font-normal text-slate-600">(minutes)</span><input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" min="1" onChange={(event) => onChange({ estimatedMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.estimatedMinutes ?? ""} /></label></div><fieldset><legend className="text-sm font-medium text-slate-800">Ingredients</legend><div className="mt-2 space-y-2">{draft.ingredients.map((ingredient, index) => <div className="grid gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]" key={index}><label><span className="sr-only">Ingredient {index + 1} name</span><input className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" onChange={(event) => updateIngredient(index, { itemName: event.target.value })} value={ingredient.itemName} /></label><label><span className="sr-only">Ingredient {index + 1} quantity</span><input className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" min="0" onChange={(event) => updateIngredient(index, { quantity: event.target.value ? Number(event.target.value) : null })} placeholder="Qty" type="number" value={ingredient.quantity ?? ""} /></label><label><span className="sr-only">Ingredient {index + 1} unit</span><select className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" onChange={(event) => updateIngredient(index, { unit: (event.target.value || null) as DraftIngredient["unit"] })} value={ingredient.unit ?? ""}><option value="">Unit</option>{SUPPORTED_COOKING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><button className="text-sm font-medium text-slate-700 underline" onClick={() => onChange({ ingredients: draft.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index) })} type="button">Remove</button></div>)}</div><button className="mt-2 text-sm font-medium text-emerald-800 underline" onClick={() => onChange({ ingredients: [...draft.ingredients, emptyIngredient()] })} type="button">Add ingredient</button></fieldset><label className="block text-sm font-medium text-slate-800">Method<textarea className="mt-1 block min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" onChange={(event) => onChange({ instructions: event.target.value })} value={draft.instructions} /></label></div>;
}
