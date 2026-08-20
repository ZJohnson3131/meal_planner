import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import {
  assertRecipeImportTime,
  createRecipeImportBudget,
  RECIPE_IMPORT_LIMITS,
  sanitizeRecipeUrl,
  type RecipeImportBudget,
  type RecipeImportData,
  type RecipeImportIngredient,
} from "@/lib/recipes/recipe-import-contract";
import { parseIngredientLineForReview } from "@/lib/recipes/parse-ingredient-line";
import { fetchRecipeHtml } from "@/lib/recipes/safe-recipe-fetch";

export type ParsedRecipe = RecipeImportData;

type ParsedIngredients = {
  ingredients: RecipeImportIngredient[];
  reviewRequired: boolean;
};

type SemanticRecipe = {
  recipe: ParsedRecipe;
  ingredientReviewRequired: boolean;
};

function plainText(
  value: unknown,
  maxLength: number = RECIPE_IMPORT_LIMITS.instructionsCharacters,
): string {
  if (typeof value !== "string") return "";

  // Cheerio decodes entities and strips markup without evaluating page scripts.
  return cheerio
    .load(`<body>${value}</body>`)("body")
    .text()
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sourceUrlOrEmpty(value: string): string {
  return sanitizeRecipeUrl(value) ?? "";
}

function flattenJsonLd(value: unknown, depth = 0): unknown[] {
  if (depth >= RECIPE_IMPORT_LIMITS.jsonLdDepth) return [];
  if (Array.isArray(value)) {
    const nodes: unknown[] = [];
    for (const child of value) {
      nodes.push(...flattenJsonLd(child, depth + 1));
      if (nodes.length >= RECIPE_IMPORT_LIMITS.jsonLdNodes) break;
    }
    return nodes.slice(0, RECIPE_IMPORT_LIMITS.jsonLdNodes);
  }
  if (value && typeof value === "object" && "@graph" in value) {
    return flattenJsonLd((value as { "@graph": unknown })["@graph"], depth + 1);
  }
  return [value];
}

function isRecipe(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as { "@type"?: unknown })["@type"];
  return Array.isArray(type)
    ? type.some((value) => String(value).toLowerCase() === "recipe")
    : String(type).toLowerCase() === "recipe";
}

function parseServings(raw: unknown): number | null {
  const text = plainText(Array.isArray(raw) ? raw[0] : raw, RECIPE_IMPORT_LIMITS.labelCharacters);
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;

  const servings = Number(match[0]);
  return Number.isFinite(servings) && servings > 0 ? servings : null;
}

function instructionText(value: unknown, depth = 0): string[] {
  if (depth >= RECIPE_IMPORT_LIMITS.jsonLdDepth) return [];
  if (typeof value === "string") return [plainText(value)];
  if (Array.isArray(value)) {
    return value
      .slice(0, RECIPE_IMPORT_LIMITS.jsonLdNodes)
      .flatMap((child) => instructionText(child, depth + 1));
  }
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return instructionText(node.text ?? node.name ?? node.itemListElement, depth + 1);
  }
  return [];
}

function parseIngredientLines(lines: string[]): ParsedIngredients {
  const parsedLines = lines
    .slice(0, RECIPE_IMPORT_LIMITS.ingredients)
    .map((line) => parseIngredientLineForReview(line));

  return {
    ingredients: parsedLines
      .map(({ ingredient }) => ingredient)
      .filter((ingredient) => ingredient.itemName.length > 0),
    reviewRequired: parsedLines.some(({ reviewRequired }) => reviewRequired),
  };
}

function sectionHeading($: cheerio.CheerioAPI, names: string[]): cheerio.Cheerio<AnyNode> {
  return $("h2, h3, h4, h5, h6, [role='heading']").filter((_, element) => {
    const label = plainText($(element).text(), RECIPE_IMPORT_LIMITS.labelCharacters).toLowerCase();
    return names.some((name) => label === name || label.startsWith(`${name} `) || label.startsWith(`${name}:`));
  }).first();
}

function sectionListText(
  $: cheerio.CheerioAPI,
  heading: cheerio.Cheerio<AnyNode>,
): string[] {
  if (heading.length === 0) return [];

  // Recipe sites commonly place the list directly after its heading. Looking
  // only in the heading's nearby structure avoids treating navigation/footer
  // lists as recipe content.
  let list = $();
  for (const sibling of heading.nextAll().toArray()) {
    const siblingNode = $(sibling);
    if (sibling.tagName?.match(/^h[1-6]$/i)) break;
    list = siblingNode.is("ul, ol") ? siblingNode : siblingNode.find("ul, ol").first();
    if (list.length > 0) break;
  }

  // Some component libraries wrap the list one or more levels below a sibling
  // container (heading > div > ul). The heading's parent is still a bounded
  // recipe section, so consider its first list only after the direct scan.
  if (list.length === 0) list = heading.parent().find("ul, ol").first();

  return list
    .find("li")
    .toArray()
    .slice(0, RECIPE_IMPORT_LIMITS.ingredients)
    .map((item) => plainText($(item).text(), RECIPE_IMPORT_LIMITS.ingredientLineCharacters).replace(/^step\s+\d+\s*/i, ""))
    .filter(Boolean);
}

function semanticRecipe(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  budget?: RecipeImportBudget,
): SemanticRecipe {
  if (budget) assertRecipeImportTime(budget);
  $("script, style, noscript, template, svg").remove();
  const title = plainText($("h1").first().text(), RECIPE_IMPORT_LIMITS.titleCharacters)
    || plainText($("title").first().text(), RECIPE_IMPORT_LIMITS.titleCharacters)
    || "Untitled recipe";
  const ingredientLines = sectionListText($, sectionHeading($, ["ingredients"]));
  const parsedIngredients = parseIngredientLines(ingredientLines);
  const methodLines = sectionListText($, sectionHeading($, ["method", "instructions", "directions", "preparation"]));
  const servingCandidates = [
    ...$("[data-testid*='serv' i], [class*='serv' i], [aria-label*='serv' i]")
      .toArray()
      .slice(0, RECIPE_IMPORT_LIMITS.servingCandidates)
      .map((element) => plainText(
        $(element).text() || $(element).attr("aria-label"),
        RECIPE_IMPORT_LIMITS.labelCharacters,
      )),
    plainText($("article").first().text() || $("body").text(), RECIPE_IMPORT_LIMITS.sectionTextCharacters),
  ];
  const servings = servingCandidates
    .map((candidate) => candidate.match(/(?:serves?|servings?|makes?|yield)\s*:?\s*(\d+(?:\.\d+)?)/i)
      ?? candidate.match(/(\d+(?:\.\d+)?)\s*(?:serves?|servings?)/i))
    .map((match) => (match ? Number(match[1]) : null))
    .find((value): value is number => value !== null && Number.isFinite(value) && value > 0) ?? null;

  if (budget) assertRecipeImportTime(budget);
  return {
    recipe: {
      title,
      sourceUrl,
      servings,
      ingredients: parsedIngredients.ingredients,
      instructions: methodLines.join("\n\n").slice(0, RECIPE_IMPORT_LIMITS.instructionsCharacters),
      ingestionStatus: "needs_review",
    },
    ingredientReviewRequired: parsedIngredients.reviewRequired,
  };
}

function fallbackRecipe(
  html: string,
  sourceUrl: string,
  budget?: RecipeImportBudget,
): ParsedRecipe {
  if (budget) assertRecipeImportTime(budget);
  const $ = cheerio.load(html);
  if (budget) assertRecipeImportTime(budget);
  const semantic = semanticRecipe($, sourceUrl, budget);
  const complete = semantic.recipe.title !== "Untitled recipe"
    && semantic.recipe.ingredients.length > 0
    && semantic.recipe.instructions.length > 0;
  return {
    ...semantic.recipe,
    ingestionStatus: complete && !semantic.ingredientReviewRequired ? "parsed" : "needs_review",
  };
}

/**
 * Extracts schema.org Recipe JSON-LD, then supplements missing data with nearby
 * semantic recipe headings/lists. Returned strings are plain text and remain
 * user-editable; incomplete results are deliberately marked `needs_review`.
 */
export function parseRecipeHtml(
  html: string,
  sourceUrl: string,
  budget?: RecipeImportBudget,
): ParsedRecipe {
  if (budget) assertRecipeImportTime(budget);
  const safeSourceUrl = sourceUrlOrEmpty(sourceUrl);
  if (
    typeof html !== "string"
    || html.length === 0
    || Buffer.byteLength(html, "utf8") > RECIPE_IMPORT_LIMITS.htmlBytes
  ) {
    return fallbackRecipe("", safeSourceUrl, budget);
  }

  const $ = cheerio.load(html);
  if (budget) assertRecipeImportTime(budget);
  const nodes: unknown[] = [];
  $("script[type='application/ld+json']")
    .toArray()
    .slice(0, RECIPE_IMPORT_LIMITS.jsonLdScripts)
    .forEach((script) => {
      if (budget) assertRecipeImportTime(budget);
      const json = $(script).text();
      if (!json || json.length > RECIPE_IMPORT_LIMITS.jsonLdScriptCharacters) return;

      try {
        nodes.push(...flattenJsonLd(JSON.parse(json)).slice(
          0,
          Math.max(0, RECIPE_IMPORT_LIMITS.jsonLdNodes - nodes.length),
        ));
      } catch {
        // A malformed metadata block must not prevent the manual-review path.
      }
    });

  const recipe = nodes.find(isRecipe);
  if (!recipe) return fallbackRecipe(html, safeSourceUrl, budget);

  const semantic = semanticRecipe($, safeSourceUrl, budget);

  const title = plainText(recipe.name, RECIPE_IMPORT_LIMITS.titleCharacters) || "Untitled recipe";
  const parsedIngredients = parseIngredientLines(
    Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map((line) => plainText(String(line), RECIPE_IMPORT_LIMITS.ingredientLineCharacters))
      : [],
  );
  const instructions = instructionText(recipe.recipeInstructions)
    .filter(Boolean)
    .join("\n\n")
    .slice(0, RECIPE_IMPORT_LIMITS.instructionsCharacters);
  const resolvedTitle = title !== "Untitled recipe" ? title : semantic.recipe.title;
  const resolvedIngredients = parsedIngredients.ingredients.length > 0
    ? parsedIngredients.ingredients
    : semantic.recipe.ingredients;
  const resolvedInstructions = instructions || semantic.recipe.instructions;
  const resolvedServings = parseServings(recipe.recipeYield) ?? semantic.recipe.servings;
  const ingredientReviewRequired = parsedIngredients.ingredients.length > 0
    ? parsedIngredients.reviewRequired
    : semantic.ingredientReviewRequired;
  const complete = resolvedTitle !== "Untitled recipe"
    && resolvedIngredients.length > 0
    && resolvedInstructions.length > 0;
  if (budget) assertRecipeImportTime(budget);

  return {
    title: resolvedTitle,
    sourceUrl: safeSourceUrl,
    servings: resolvedServings,
    ingredients: resolvedIngredients,
    instructions: resolvedInstructions,
    ingestionStatus: complete && !ingredientReviewRequired ? "parsed" : "needs_review",
  };
}

/**
 * Fetches and parses a recipe within one aggregate DNS/network/parser budget.
 * Route handlers should use this entry point instead of pre-validating the URL,
 * which would repeat DNS resolution without reusing the pinned address.
 */
export async function ingestRecipeUrl(
  sourceUrl: string,
  budget: RecipeImportBudget = createRecipeImportBudget(),
): Promise<ParsedRecipe> {
  const fetched = await fetchRecipeHtml(sourceUrl, budget);
  return parseRecipeHtml(fetched.html, fetched.finalUrl, budget);
}
