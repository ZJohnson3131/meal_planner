import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

const recipeIdSchema = z.string().uuid();

export default async function RecipeDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = recipeIdSchema.safeParse(id);
  if (!recipeId.success) notFound();

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("id, title, description, source_url, favorite, servings, instructions, ingestion_status, recipe_ingredients(id, item_name, quantity, unit, notes, display_order)")
    .eq("id", recipeId.data)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error("Failed to load recipe");
  if (!recipe) notFound();

  const ingredients = [...(recipe.recipe_ingredients ?? [])].sort(
    (first, second) => first.display_order - second.display_order,
  );

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <Link className="text-sm font-medium text-emerald-700 hover:underline" href="/recipes">← Recipes</Link>
      <header className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">{recipe.title}</h1>
          {recipe.favorite ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">Favorite</span> : null}
          {recipe.ingestion_status !== "manual" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{recipe.ingestion_status.replace("_", " ")}</span> : null}
        </div>
        {recipe.description ? <p className="whitespace-pre-wrap text-slate-600">{recipe.description}</p> : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          {recipe.servings ? <div><dt className="inline font-medium text-slate-950">Servings: </dt><dd className="inline">{recipe.servings}</dd></div> : null}
          {recipe.source_url ? <div><dt className="inline font-medium text-slate-950">Source: </dt><dd className="inline"><a className="text-emerald-700 hover:underline" href={recipe.source_url} rel="noreferrer" target="_blank">View original recipe</a></dd></div> : null}
        </dl>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Ingredients</h2>
        <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-5">
          {ingredients.map((ingredient) => <li className="text-slate-700" key={ingredient.id}>{[ingredient.quantity, ingredient.unit, ingredient.item_name].filter(Boolean).join(" ")}{ingredient.notes ? ` (${ingredient.notes})` : ""}</li>)}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Instructions</h2>
        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-5 leading-7 text-slate-700">{recipe.instructions || "No instructions added yet."}</p>
      </section>
    </article>
  );
}
