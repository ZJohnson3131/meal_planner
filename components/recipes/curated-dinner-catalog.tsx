"use client";

import { useMemo, useState, useTransition } from "react";

export type CuratedDinnerTag = {
  slug: string;
  label: string;
  category: "course" | "cuisine" | "protein" | "method" | "dietary";
};

export type CuratedDinnerCatalogRecipe = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  tags: CuratedDinnerTag[];
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  adoptedRecipeId: string | null;
};

export type CuratedDinnerAdoptionResult = {
  recipeId: string;
};

type CuratedDinnerCatalogProps = {
  recipes: CuratedDinnerCatalogRecipe[];
  adoptRecipe: (curatedRecipeId: string) => Promise<CuratedDinnerAdoptionResult>;
};

function tagClass(category: CuratedDinnerTag["category"]) {
  const classes: Record<CuratedDinnerTag["category"], string> = {
    course: "bg-slate-100 text-slate-700",
    cuisine: "bg-sky-100 text-sky-900",
    protein: "bg-amber-100 text-amber-900",
    method: "bg-violet-100 text-violet-900",
    dietary: "bg-emerald-100 text-emerald-900",
  };

  return classes[category];
}

/** Browse the shared, attributed dinner library and copy individual recipes into a household. */
export function CuratedDinnerCatalog({ recipes, adoptRecipe }: CuratedDinnerCatalogProps) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [adoptedIds, setAdoptedIds] = useState(() => new Set(recipes.filter((recipe) => recipe.adoptedRecipeId !== null).map((recipe) => recipe.id)));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableTags = useMemo(
    () => [...new Map(recipes.flatMap((recipe) => recipe.tags).map((tag) => [tag.slug, tag])).values()]
      .sort((left, right) => left.label.localeCompare(right.label)),
    [recipes],
  );

  const visibleRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return recipes.filter((recipe) => {
      const textMatches = normalizedQuery === ""
        || [recipe.title, recipe.description ?? "", ...recipe.tags.map((tag) => tag.label)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      const tagsMatch = selectedTags.every((slug) => recipe.tags.some((tag) => tag.slug === slug));
      return textMatches && tagsMatch;
    });
  }, [query, recipes, selectedTags]);

  function toggleTag(slug: string) {
    setSelectedTags((current) => current.includes(slug) ? current.filter((tag) => tag !== slug) : [...current, slug]);
  }

  function adopt(recipe: CuratedDinnerCatalogRecipe) {
    setError(null);
    setMessage(null);
    setPendingRecipeId(recipe.id);
    startTransition(async () => {
      try {
        await adoptRecipe(recipe.id);
        setAdoptedIds((current) => new Set(current).add(recipe.id));
        setMessage(`${recipe.title} was added to your recipe library.`);
      } catch {
        setError(`We could not add ${recipe.title}. Please try again.`);
      } finally {
        setPendingRecipeId(null);
      }
    });
  }

  return (
    <section aria-labelledby="curated-dinners-heading" className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-950" id="curated-dinners-heading">Dinner collection</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Browse {recipes.length} curated dinner ideas, then add any recipe to your library. Added recipes are copied to your household so you can edit them freely.
        </p>
      </div>

      <div className="space-y-3 rounded-md bg-slate-50 p-4">
        <label className="block text-sm font-medium text-slate-800" htmlFor="curated-dinner-search">
          Find a dinner
          <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" id="curated-dinner-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, cuisine, or dietary preference" type="search" value={query} />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Filter by tags</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const selected = selectedTags.includes(tag.slug);
              return (
                <button aria-pressed={selected} className={`rounded-full border px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`} key={tag.slug} onClick={() => toggleTag(tag.slug)} type="button">
                  {tag.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <p aria-live="polite" className="text-sm text-emerald-800" role="status">{message}</p>
      {error ? <p aria-live="assertive" className="text-sm text-red-700" role="alert">{error}</p> : null}

      {visibleRecipes.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">No dinners match those filters. Clear a tag or try another search.</p>
      ) : (
        <ul aria-label="Curated dinner recipes" className="grid gap-4 md:grid-cols-2">
          {visibleRecipes.map((recipe) => {
            const added = adoptedIds.has(recipe.id);
            const pending = isPending && pendingRecipeId === recipe.id;
            return (
              <li className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4" key={recipe.id}>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-950">{recipe.title}</h3>
                    {recipe.servings ? <span className="text-sm text-slate-600">Serves {recipe.servings}</span> : null}
                  </div>
                  {recipe.description ? <p className="text-sm leading-6 text-slate-600">{recipe.description}</p> : null}
                  <div className="flex flex-wrap gap-1.5" aria-label={`${recipe.title} tags`}>
                    {recipe.tags.map((tag) => <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass(tag.category)}`} key={tag.slug}>{tag.label}</span>)}
                  </div>
                </div>
                <div className="space-y-2 text-xs leading-5 text-slate-600">
                  <p>
                    Source: <a className="text-emerald-800 underline" href={recipe.sourceUrl} rel="noreferrer" target="_blank">{recipe.sourceName}</a>. Licensed under <a className="text-emerald-800 underline" href={recipe.licenseUrl} rel="noreferrer" target="_blank">{recipe.licenseName}</a>.
                  </p>
                  <button className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={added || pending || isPending} onClick={() => adopt(recipe)} type="button">
                    {pending ? "Adding..." : added ? "Added to library" : "Add to my recipes"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
