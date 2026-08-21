/**
 * Shared limits and wire contract for untrusted recipe imports.
 *
 * Keep browser-extension copies generated or behavior-tested against this
 * contract. The extension cannot import application TypeScript at runtime.
 */
export const RECIPE_IMPORT_PAYLOAD_VERSION = 1 as const;

export const RECIPE_IMPORT_LIMITS = Object.freeze({
  aggregateDeadlineMs: 12_000,
  descriptionCharacters: 10_000,
  extensionDraftBytes: 12_000,
  extensionIngredients: 100,
  extensionSemanticContainerDepth: 4,
  htmlBytes: 1_000_000,
  ingredientLineCharacters: 2_000,
  ingredients: 500,
  instructionsCharacters: 100_000,
  jsonLdDepth: 32,
  jsonLdNodes: 500,
  jsonLdScriptCharacters: 200_000,
  jsonLdScripts: 50,
  labelCharacters: 200,
  redirects: 3,
  requestBodyBytes: 4 * 1_024,
  sectionTextCharacters: 20_000,
  servingCandidates: 20,
  servingsMaximum: 10_000,
  sourceUrlCharacters: 2_048,
  titleCharacters: 500,
  unitCharacters: 100,
} as const);

export type RecipeImportBudget = Readonly<{ deadlineAt: number }>;

export class RecipeImportDeadlineError extends Error {
  constructor() {
    super("Recipe import timed out");
    this.name = "RecipeImportDeadlineError";
  }
}

export function createRecipeImportBudget(
  durationMs: number = RECIPE_IMPORT_LIMITS.aggregateDeadlineMs,
): RecipeImportBudget {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError("Recipe import duration must be positive");
  }

  return Object.freeze({ deadlineAt: Date.now() + durationMs });
}

export function remainingRecipeImportTime(budget: RecipeImportBudget): number {
  return Math.max(0, budget.deadlineAt - Date.now());
}

export function assertRecipeImportTime(budget: RecipeImportBudget): void {
  if (remainingRecipeImportTime(budget) <= 0) {
    throw new RecipeImportDeadlineError();
  }
}

/** Bounds an asynchronous stage by the remaining time in the shared budget. */
export function withinRecipeImportTime<T>(
  budget: RecipeImportBudget,
  operation: Promise<T>,
): Promise<T> {
  const remainingMs = remainingRecipeImportTime(budget);
  if (remainingMs <= 0) return Promise.reject(new RecipeImportDeadlineError());

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RecipeImportDeadlineError()), remainingMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type RecipeImportIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

export type RecipeImportData = {
  title: string;
  sourceUrl: string;
  servings: number | null;
  ingredients: RecipeImportIngredient[];
  instructions: string;
  ingestionStatus: "parsed" | "needs_review" | "failed";
};

export type RecipeImportPayloadV1 = RecipeImportData & {
  recipeImportVersion: typeof RECIPE_IMPORT_PAYLOAD_VERSION;
};

/** Adds a version discriminator without changing the existing recipe fields. */
export function createRecipeImportPayload(recipe: RecipeImportData): RecipeImportPayloadV1 {
  return {
    ...recipe,
    sourceUrl: sanitizeRecipeUrl(recipe.sourceUrl) ?? "",
    recipeImportVersion: RECIPE_IMPORT_PAYLOAD_VERSION,
  };
}

const SIGNED_PROVIDER_PARAMETER = /^(?:x-amz-|x-goog-)/i;
const SENSITIVE_QUERY_COMPONENTS = new Set([
  "access",
  "auth",
  "authorization",
  "code",
  "credential",
  "email",
  "jwt",
  "key",
  "password",
  "refresh",
  "secret",
  "session",
  "sig",
  "signature",
  "signed",
  "token",
  "user",
  "username",
]);

function isSensitiveQueryParameter(key: string): boolean {
  const separatedCamelCase = key.replace(/([a-z\d])([A-Z])/g, "$1_$2");
  return SIGNED_PROVIDER_PARAMETER.test(key)
    || separatedCamelCase
      .split(/[^a-z\d]+/i)
      .filter(Boolean)
      .some((component) => SENSITIVE_QUERY_COMPONENTS.has(component.toLowerCase()));
}

type RecipeUrlSanitization = {
  allowHttp?: boolean;
  removeSensitiveQueryParameters?: boolean;
};

/**
 * Normalizes an untrusted recipe URL for fetching or persistence.
 * Credentials are never accepted and fragments are never retained. Persisted
 * URLs additionally redact query keys commonly used for credentials, signed
 * access, accounts, or user-identifying data.
 */
export function sanitizeRecipeUrl(
  rawUrl: string,
  {
    allowHttp = true,
    removeSensitiveQueryParameters = true,
  }: RecipeUrlSanitization = {},
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (
    (url.protocol !== "https:" && (!allowHttp || url.protocol !== "http:"))
    || url.username
    || url.password
  ) {
    return null;
  }

  url.hash = "";
  if (removeSensitiveQueryParameters) {
    const keysToRemove = [...new Set(url.searchParams.keys())].filter(
      (key) => isSensitiveQueryParameter(key),
    );
    keysToRemove.forEach((key) => url.searchParams.delete(key));
  }

  return url.toString();
}
