export type RankableSavedRecipe = {
  id: string;
  title: string;
  description: string | null;
  favorite: boolean;
  ingredientNames: string[];
  /** Saved recipes currently do not persist this value, but callers may provide it when available. */
  estimatedMinutes?: number | null;
};

export type RankedSavedRecipe = RankableSavedRecipe & { reviewRequired: boolean };

export type SavedRecipeRankingOptions = {
  preferFavorites: boolean;
  dietaryExclusions: string[];
  goals?: readonly string[];
  likesDislikes?: string | null;
  maxCookingMinutes?: number | null;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "avoid", "avoids", "do", "does", "for", "has", "have",
  "i", "like", "likes", "me", "my", "not", "of", "or", "the", "to", "with", "but",
]);

const GOAL_TERMS: Record<string, string[]> = {
  simple: ["simple", "easy", "quick", "fast"],
  high_protein: ["high protein", "protein", "chicken", "beef", "fish", "egg", "tofu", "lentil", "chickpea", "bean"],
  budget_friendly: ["budget", "cheap", "inexpensive", "economical"],
  family_friendly: ["family", "kid", "kids", "children"],
  vegetarian: ["vegetarian", "vegan", "plant based", "plant-based", "meatless", "tofu", "lentil", "chickpea", "bean"],
  pantry_friendly: ["pantry", "staple", "canned", "tinned", "frozen"],
};

function normalizeText(value: string): string {
  return value.toLocaleLowerCase();
}

function searchTerms(value: string): string[] {
  return normalizeText(value)
    .match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g)
    ?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) ?? [];
}

function preferenceTerms(value: string | null | undefined): { positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];
  const markerPattern = /\b(?:likes?|loves?|enjoys?|prefers?)\b|\b(?:avoid(?:s)?|dislikes?|hates?|without|no)\b|\b(?:do(?:es)? not|do(?:es)?n't)\s+like\b/gi;
  for (const clause of (value ?? "").split(/[,.!?;]+/)) {
    const markers = [...clause.matchAll(markerPattern)];
    if (markers.length === 0) {
      positive.push(...searchTerms(clause));
      continue;
    }

    markers.forEach((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[index + 1]?.index ?? clause.length;
      const terms = searchTerms(clause.slice(start, end));
      const negativeMarker = /^(?:avoid|dislike|hate|without|no|do(?:es)? not|do(?:es)?n't)/i.test(marker[0]);
      (negativeMarker ? negative : positive).push(...terms);
    });
  }
  return {
    positive: [...new Set(positive)],
    negative: [...new Set(negative)],
  };
}

/** Ranks saved recipes against explicit preferences without silently claiming unsupported matches. */
export function rankSavedRecipes<T extends RankableSavedRecipe>(
  recipes: T[],
  options: SavedRecipeRankingOptions,
): Array<T & { reviewRequired: boolean }> {
  const exclusions = options.dietaryExclusions.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  const preferences = preferenceTerms(options.likesDislikes);
  return recipes
    .map((recipe) => {
      const searchable = normalizeText([recipe.title, recipe.description ?? "", ...recipe.ingredientNames].join(" "));
      const goalScore = (options.goals ?? []).reduce((score, goal) => (
        (GOAL_TERMS[goal] ?? []).some((term) => searchable.includes(term)) ? score + 1 : score
      ), 0);
      const positiveScore = preferences.positive.reduce((score, term) => searchable.includes(term) ? score + 1 : score, 0);
      const negativeConflict = preferences.negative.some((term) => searchable.includes(term));
      const timeConflict = options.maxCookingMinutes != null
        && recipe.estimatedMinutes != null
        && recipe.estimatedMinutes > options.maxCookingMinutes;
      const timeUnknown = options.maxCookingMinutes != null && recipe.estimatedMinutes == null;
      const conflicts = exclusions.some((exclusion) => searchable.includes(exclusion));
      return {
        ...recipe,
        preferenceScore: goalScore + positiveScore - (negativeConflict ? 100 : 0) - (timeConflict ? 100 : 0),
        reviewRequired: (exclusions.length > 0 && !conflicts) || negativeConflict || timeConflict || timeUnknown,
      };
    })
    .filter((recipe) => !exclusions.some((exclusion) => [recipe.title, recipe.description ?? "", ...recipe.ingredientNames].join(" ").toLocaleLowerCase().includes(exclusion)))
    .sort((left, right) => {
      if (left.preferenceScore !== right.preferenceScore) return right.preferenceScore - left.preferenceScore;
      if (left.reviewRequired !== right.reviewRequired) return left.reviewRequired ? 1 : -1;
      if (options.preferFavorites && left.favorite !== right.favorite) return left.favorite ? -1 : 1;
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
    })
    .map((recipe) => {
      const result = { ...recipe } as T & { reviewRequired: boolean; preferenceScore?: number };
      delete result.preferenceScore;
      return result;
    });
}
