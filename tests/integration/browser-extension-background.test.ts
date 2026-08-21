import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  RECIPE_IMPORT_LIMITS,
  RECIPE_IMPORT_PAYLOAD_VERSION,
} from "@/lib/recipes/recipe-import-contract";

type ExtensionProtocol = {
  recipeImportVersion: number;
  limits: Record<string, number>;
};

function evaluateExtensionProtocol(source: string): ExtensionProtocol {
  const declaration = source.match(
    /const RECIPE_IMPORT_PROTOCOL = Object\.freeze\([\s\S]*?\r?\n\}\);(?=\r?\n\r?\nfunction extractRecipeDraft)/,
  )?.[0];
  if (!declaration) throw new Error("Could not locate extension import protocol");
  return new Function(`${declaration}; return RECIPE_IMPORT_PROTOCOL;`)() as ExtensionProtocol;
}

describe("browser extension injected extractor", () => {
  test("keeps injected extraction limits self-contained and rejects a missing result", async () => {
    const source = await readFile(resolve(process.cwd(), "browser-extension/background.js"), "utf8");
    const extractor = source.match(/function extractRecipeDraft\(protocol\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const protocol = evaluateExtensionProtocol(source);

    expect(source).toContain("const RECIPE_IMPORT_PROTOCOL = Object.freeze({");
    expect(protocol).toEqual({
      recipeImportVersion: RECIPE_IMPORT_PAYLOAD_VERSION,
      limits: {
        draftBytes: RECIPE_IMPORT_LIMITS.extensionDraftBytes,
        ingredientLineCharacters: RECIPE_IMPORT_LIMITS.ingredientLineCharacters,
        ingredients: RECIPE_IMPORT_LIMITS.extensionIngredients,
        instructionsCharacters: RECIPE_IMPORT_LIMITS.instructionsCharacters,
        labelCharacters: RECIPE_IMPORT_LIMITS.labelCharacters,
        semanticContainerDepth: RECIPE_IMPORT_LIMITS.extensionSemanticContainerDepth,
        servingsMaximum: RECIPE_IMPORT_LIMITS.servingsMaximum,
        sourceUrlCharacters: RECIPE_IMPORT_LIMITS.sourceUrlCharacters,
        titleCharacters: RECIPE_IMPORT_LIMITS.titleCharacters,
        unitCharacters: RECIPE_IMPORT_LIMITS.unitCharacters,
      },
    });
    expect(Object.isFrozen(protocol)).toBe(true);
    expect(Object.isFrozen(protocol.limits)).toBe(true);
    expect(extractor).toContain("const limits = protocol.limits");
    expect(extractor).toContain("recipeImportVersion: protocol.recipeImportVersion");
    expect(source).toMatch(/func: extractRecipeDraft,\s*args: \[RECIPE_IMPORT_PROTOCOL\]/);
    expect(source).not.toMatch(/args: \[[^\]]*,[^\]]*\]/);
    expect(source).toContain("!draft");
    expect(source).toContain("draft.recipeImportVersion !== RECIPE_IMPORT_PROTOCOL.recipeImportVersion");
  });
});
