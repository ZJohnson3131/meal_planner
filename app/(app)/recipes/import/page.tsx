import Link from "next/link";

import { ExtensionRecipeImport } from "@/components/forms/extension-recipe-import";

export default function ExtensionRecipeImportPage() {
  return (
    <div className="space-y-6">
      <Link className="text-sm font-medium text-emerald-700 hover:underline" href="/recipes">â† Recipes</Link>
      <ExtensionRecipeImport />
    </div>
  );
}
