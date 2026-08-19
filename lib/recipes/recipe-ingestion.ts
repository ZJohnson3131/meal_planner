import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { parseIngredientLine, type ParsedIngredient } from "@/lib/recipes/parse-ingredient-line";

const MAX_HTML_LENGTH = 1_000_000;
const MAX_JSON_LD_SCRIPTS = 50;
const MAX_JSON_LD_SCRIPT_LENGTH = 200_000;
const MAX_INGREDIENTS = 500;
const MAX_TEXT_LENGTH = 100_000;
const MAX_SECTION_TEXT_LENGTH = 20_000;

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

function sectionHeading($: cheerio.CheerioAPI, names: string[]): cheerio.Cheerio<AnyNode> {
  return $("h2, h3, h4, h5, h6, [role='heading']").filter((_, element) => {
    const label = plainText($(element).text(), 200).toLowerCase();
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
  const siblingList = heading.nextAll().toArray().find((sibling) => {
    const tagName = sibling.tagName?.toLowerCase();
    return !tagName?.match(/^h[1-6]$/);
  });
  const list = siblingList && $(siblingList).is("ul, ol")
    ? $(siblingList)
    : siblingList
      ? $(siblingList).children("ul, ol").first()
      : heading.parent().children("ul, ol").first();

  return list
    .find("li")
    .toArray()
    .slice(0, MAX_INGREDIENTS)
    .map((item) => plainText($(item).text(), 2_000))
    .filter(Boolean);
}

function semanticRecipe(html: string, sourceUrl: string): ParsedRecipe {
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg").remove();
  const title = plainText($("h1").first().text(), 500)
    || plainText($("title").first().text(), 500)
    || "Untitled recipe";
  const ingredientLines = sectionListText($, sectionHeading($, ["ingredients"]));
  const methodLines = sectionListText($, sectionHeading($, ["method", "instructions", "directions", "preparation"]));
  const servingCandidates = [
    ...$("[data-testid*='serv' i], [class*='serv' i], [aria-label*='serv' i]")
      .toArray()
      .slice(0, 20)
      .map((element) => plainText($(element).text() || $(element).attr("aria-label"), 200)),
    plainText($("article").first().text() || $("body").text(), MAX_SECTION_TEXT_LENGTH),
  ];
  const servings = servingCandidates
    .map((candidate) => candidate.match(/(?:serves?|servings?|makes?|yield)\s*:?\s*(\d+(?:\.\d+)?)/i)
      ?? candidate.match(/(\d+(?:\.\d+)?)\s*(?:serves?|servings?)/i))
    .map((match) => (match ? Number(match[1]) : null))
    .find((value): value is number => value !== null && Number.isFinite(value) && value > 0) ?? null;

  return {
    title,
    sourceUrl,
    servings,
    ingredients: ingredientLines.map((line) => parseIngredientLine(line)).filter((ingredient) => ingredient.itemName.length > 0),
    instructions: methodLines.join("\n\n").slice(0, MAX_TEXT_LENGTH),
    ingestionStatus: "needs_review",
  };
}

function fallbackRecipe(html: string, sourceUrl: string): ParsedRecipe {
  const semantic = semanticRecipe(html, sourceUrl);
  const complete = semantic.title !== "Untitled recipe"
    && semantic.ingredients.length > 0
    && semantic.instructions.length > 0;
  return {
    ...semantic,
    ingestionStatus: complete ? "parsed" : "needs_review",
  };
}

/**
 * Extracts schema.org Recipe JSON-LD, then supplements missing data with nearby
 * semantic recipe headings/lists. Returned strings are plain text and remain
 * user-editable; incomplete results are deliberately marked `needs_review`.
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

  const semantic = semanticRecipe(html, safeSourceUrl);

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
  const resolvedTitle = title !== "Untitled recipe" ? title : semantic.title;
  const resolvedIngredients = ingredients.length > 0 ? ingredients : semantic.ingredients;
  const resolvedInstructions = instructions || semantic.instructions;
  const resolvedServings = parseServings(recipe.recipeYield) ?? semantic.servings;
  const complete = resolvedTitle !== "Untitled recipe"
    && resolvedIngredients.length > 0
    && resolvedInstructions.length > 0;

  return {
    title: resolvedTitle,
    sourceUrl: safeSourceUrl,
    servings: resolvedServings,
    ingredients: resolvedIngredients,
    instructions: resolvedInstructions,
    ingestionStatus: complete ? "parsed" : "needs_review",
  };
}
