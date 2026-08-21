export type RankableSavedRecipe = {
  id: string;
  title: string;
  description: string | null;
  favorite: boolean;
  ingredientNames: string[];
};

export type RankedSavedRecipe = RankableSavedRecipe & { reviewRequired: boolean };

/** A stable, explainable ordering; favorites only influence it when requested. */
export function rankSavedRecipes<T extends RankableSavedRecipe>(
  recipes: T[],
  options: { preferFavorites: boolean; dietaryExclusions: string[] },
): Array<T & { reviewRequired: boolean }> {
  const exclusions = options.dietaryExclusions.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  return recipes
    .map((recipe) => {
      const searchable = [recipe.title, recipe.description ?? "", ...recipe.ingredientNames].join(" ").toLocaleLowerCase();
      const conflicts = exclusions.some((exclusion) => searchable.includes(exclusion));
      return { ...recipe, reviewRequired: exclusions.length > 0 && !conflicts };
    })
    .filter((recipe) => !exclusions.some((exclusion) => [recipe.title, recipe.description ?? "", ...recipe.ingredientNames].join(" ").toLocaleLowerCase().includes(exclusion)))
    .sort((left, right) => {
      if (options.preferFavorites && left.favorite !== right.favorite) return left.favorite ? -1 : 1;
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
    });
}
