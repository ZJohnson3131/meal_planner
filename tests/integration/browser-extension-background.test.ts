import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("browser extension injected extractor", () => {
  test("keeps injected extraction limits self-contained and rejects a missing result", async () => {
    const source = await readFile(resolve(process.cwd(), "browser-extension/background.js"), "utf8");
    const extractor = source.match(/function extractRecipeDraft\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(extractor).toContain("const maxDraftBytes = 12_000");
    expect(extractor).toContain("const maxIngredients = 100");
    expect(extractor).not.toContain("MAX_DRAFT_BYTES");
    expect(extractor).not.toContain("MAX_INGREDIENTS");
    expect(source).toContain("if (!draft || typeof draft !== \"object\")");
  });
});
