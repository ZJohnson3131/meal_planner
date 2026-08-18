import Link from "next/link";

export type RecipeListItem = {
  id: string;
  title: string;
  favorite: boolean;
  source_url: string | null;
};

type RecipeListProps = {
  recipes: RecipeListItem[];
};

export function RecipeList({ recipes }: RecipeListProps) {
  if (recipes.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-600">No recipes yet. Add one to start planning dinners.</p>;
  }

  return (
    <ul aria-label="Recipes" className="divide-y divide-slate-200 rounded-lg border border-slate-200">
      {recipes.map((recipe) => (
        <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={recipe.id}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-950">{recipe.title}</h2>
              {recipe.favorite ? <span aria-label="Favorite recipe" className="text-amber-600" title="Favorite recipe">★</span> : null}
            </div>
            {recipe.source_url ? (
              <a className="text-sm text-emerald-800 underline" href={recipe.source_url} rel="noreferrer" target="_blank">
                View source
              </a>
            ) : null}
          </div>
          <Link className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/recipes/${recipe.id}`}>
            View details
          </Link>
        </li>
      ))}
    </ul>
  );
}
