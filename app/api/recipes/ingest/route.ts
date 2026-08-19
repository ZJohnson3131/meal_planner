import { NextResponse } from "next/server";

import { parseRecipeHtml, type ParsedRecipe } from "@/lib/recipes/recipe-ingestion";
import { fetchRecipeHtml, validateRecipeUrl } from "@/lib/recipes/safe-recipe-fetch";
import { createClient } from "@/lib/supabase/server";
import { recipeSourceUrlSchema } from "@/lib/validation/recipes";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_REQUEST_BYTES = 4 * 1024;
const BLOCKED_IMPORT_MESSAGE = "This site blocks automatic imports. Copy the ingredients and method into the recipe form, or use the Firefox extension while viewing the recipe.";

function failedRecipe(sourceUrl: string): ParsedRecipe {
  return {
    title: "Untitled recipe",
    sourceUrl,
    servings: null,
    ingredients: [],
    instructions: "",
    ingestionStatus: "failed",
  };
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function hasNoUsableRecipeContent(recipe: ParsedRecipe): boolean {
  return /^pardon our interruption$/i.test(recipe.title.trim())
    || (recipe.title === "Untitled recipe"
    && recipe.ingredients.length === 0
    && recipe.instructions.trim().length === 0);
}

async function hasAuthenticatedHousehold(): Promise<boolean> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return false;

  const { data, error } = await supabase
    .from("household_memberships")
    .select("household_id")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Cross-origin requests are not allowed", 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("Expected a JSON request body", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Request body is too large", 413);
  }

  if (!(await hasAuthenticatedHousehold())) return jsonError("Authentication is required", 401);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) return jsonError("Request body is too large", 413);
    body = JSON.parse(text);
  } catch {
    return jsonError("A valid JSON request body is required", 400);
  }

  const result = recipeSourceUrlSchema.safeParse(
    typeof body === "object" && body !== null ? (body as { url?: unknown }).url : undefined,
  );
  if (!result.success || !result.data.startsWith("https://")) {
    return jsonError("A valid HTTPS recipe URL is required", 400);
  }

  try {
    await validateRecipeUrl(result.data);
  } catch {
    return jsonError("The recipe URL must resolve to a public HTTPS website", 400);
  }

  try {
    const { html, finalUrl } = await fetchRecipeHtml(result.data);
    const recipe = parseRecipeHtml(html, finalUrl);
    if (hasNoUsableRecipeContent(recipe)) return jsonError(BLOCKED_IMPORT_MESSAGE, 422);
    return NextResponse.json(recipe);
  } catch {
    return NextResponse.json(failedRecipe(result.data));
  }
}
