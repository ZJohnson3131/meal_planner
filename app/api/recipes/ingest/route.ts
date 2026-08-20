import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createRecipeImportPayload,
  RECIPE_IMPORT_LIMITS,
  sanitizeRecipeUrl,
} from "@/lib/recipes/recipe-import-contract";
import { acquireRecipeIngestAdmission } from "@/lib/recipes/ingest-admission";
import { ingestRecipeUrl, type ParsedRecipe } from "@/lib/recipes/recipe-ingestion";
import { createClient } from "@/lib/supabase/server";
import { recipeFetchUrlSchema } from "@/lib/validation/recipes";

export const runtime = "nodejs";
export const maxDuration = 15;

const BLOCKED_IMPORT_MESSAGE = "This site blocks automatic imports. Copy the ingredients and method into the recipe form, or use the Firefox extension while viewing the recipe.";
const contentLengthSchema = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(RECIPE_IMPORT_LIMITS.requestBodyBytes);
const requestBodySchema = z.object({ url: recipeFetchUrlSchema }).strict();

class RequestBodyTooLargeError extends Error {}

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

async function getAuthenticatedImportPrincipal(): Promise<{
  householdId: string;
  userId: string;
} | null> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase
    .from("household_memberships")
    .select("household_id")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { householdId: data.household_id, userId: authData.user.id };
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

  const contentLength = contentLengthSchema.safeParse(
    request.headers.get("content-length") ?? 0,
  );
  if (!contentLength.success) {
    return jsonError("Request body is too large", 413);
  }

  const principal = await getAuthenticatedImportPrincipal();
  if (!principal) return jsonError("Authentication is required", 401);

  let body: unknown;
  try {
    const text = await readLimitedRequestBody(request);
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError("Request body is too large", 413);
    }
    return jsonError("A valid JSON request body is required", 400);
  }

  const result = requestBodySchema.safeParse(body);
  if (!result.success) {
    return jsonError("A valid HTTPS recipe URL is required", 400);
  }

  const admission = acquireRecipeIngestAdmission(principal.userId, principal.householdId);
  if (!admission) {
    return jsonError("Recipe import is temporarily unavailable. Try again later.", 429);
  }

  try {
    try {
      const recipe = await ingestRecipeUrl(result.data.url);
      if (hasNoUsableRecipeContent(recipe)) return jsonError(BLOCKED_IMPORT_MESSAGE, 422);
      return NextResponse.json(createRecipeImportPayload(recipe));
    } catch {
      const safeSourceUrl = sanitizeRecipeUrl(result.data.url) ?? "";
      return NextResponse.json(createRecipeImportPayload(failedRecipe(safeSourceUrl)));
    }
  } finally {
    admission.release();
  }
}

async function readLimitedRequestBody(request: Request): Promise<string> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > RECIPE_IMPORT_LIMITS.requestBodyBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
