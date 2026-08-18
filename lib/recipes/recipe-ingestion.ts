import * as cheerio from "cheerio";

import { parseIngredientLine, type ParsedIngredient } from "@/lib/recipes/parse-ingredient-line";

const MAX_HTML_LENGTH = 1_000_000;
const MAX_JSON_LD_SCRIPTS = 50;
const MAX_JSON_LD_SCRIPT_LENGTH = 200_000;
const MAX_INGREDIENTS = 500;
const MAX_TEXT_LENGTH = 100_000;

export type ParsedRecipe = {
  title: string;
  sourceUrl: string;
  servings: number | null;
  ingredients: ParsedIngredient[];
  instructions: string;
  ingestionStatus: "parsed" | "needs_review" | "failed";
};

function plainText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
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
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === "object" && "@graph" in value) {
    return flattenJsonLd((value as { "@graph": unknown })["@graph"]);
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
  const text = plainText(Array.isArray(raw) ? raw[0] : raw, 200);
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;

  const servings = Number(match[0]);
  return Number.isFinite(servings) && servings > 0 ? servings : null;
}

function instructionText(value: unknown): string[] {
  if (typeof value === "string") return [plainText(value)];
  if (Array.isArray(value)) return value.flatMap(instructionText);
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return instructionText(node.text ?? node.name ?? node.itemListElement);
  }
  return [];
}

function fallbackRecipe(html: string, sourceUrl: string): ParsedRecipe {
  const title = plainText(cheerio.load(html)("title").first().text(), 500) || "Untitled recipe";
  return {
    title,
    sourceUrl,
    servings: null,
    ingredients: [],
    instructions: "",
    ingestionStatus: "needs_review",
  };
}

/**
 * Extracts schema.org Recipe JSON-LD only. The returned strings are plain text
 * and remain user-editable; missing or incomplete data is deliberately marked
 * `needs_review` rather than trusted as a complete import.
 */
export function parseRecipeHtml(html: string, sourceUrl: string): ParsedRecipe {
  const safeSourceUrl = sourceUrlOrEmpty(sourceUrl);
  if (typeof html !== "string" || html.length === 0 || html.length > MAX_HTML_LENGTH) {
    return fallbackRecipe("", safeSourceUrl);
  }

  const $ = cheerio.load(html);
  const nodes: unknown[] = [];
  $("script[type='application/ld+json']")
    .toArray()
    .slice(0, MAX_JSON_LD_SCRIPTS)
    .forEach((script) => {
      const json = $(script).text();
      if (!json || json.length > MAX_JSON_LD_SCRIPT_LENGTH) return;

      try {
        nodes.push(...flattenJsonLd(JSON.parse(json)));
      } catch {
        // A malformed metadata block must not prevent the manual-review path.
      }
    });

  const recipe = nodes.find(isRecipe);
  if (!recipe) return fallbackRecipe(html, safeSourceUrl);

  const title = plainText(recipe.name, 500) || "Untitled recipe";
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient
        .slice(0, MAX_INGREDIENTS)
        .map((line) => parseIngredientLine(plainText(String(line), 2_000)))
        .filter((ingredient) => ingredient.itemName.length > 0)
    : [];
  const instructions = instructionText(recipe.recipeInstructions)
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_TEXT_LENGTH);
  const complete = title !== "Untitled recipe" && ingredients.length > 0 && instructions.length > 0;

  return {
    title,
    sourceUrl: safeSourceUrl,
    servings: parseServings(recipe.recipeYield),
    ingredients,
    instructions,
    ingestionStatus: complete ? "parsed" : "needs_review",
  };
}
