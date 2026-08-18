import Link from "next/link";

import { RecipeForm } from "@/components/forms/recipe-form";
import { UrlIngestForm } from "@/components/forms/url-ingest-form";

export default function NewRecipePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link className="text-sm font-medium text-emerald-700 hover:underline" href="/recipes">← Recipes</Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Add recipe</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Import a public recipe URL to prefill the form, or add recipe details manually.
          </p>
        </div>
      </div>
      <UrlIngestForm />
      <RecipeForm />
    </div>
  );
}
