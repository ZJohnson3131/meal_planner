import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

type ExtractDraft = () => {
  title: string;
  servings: number | null;
  ingredients: Array<{ itemName: string }>;
  instructions: string;
};

async function loadInjectedExtractor(): Promise<ExtractDraft> {
  const source = await readFile(resolve(process.cwd(), "browser-extension/background.js"), "utf8");
  const match = source.match(/function extractRecipeDraft\(\) \{[\s\S]*?\n\}\n\nfunction encodeDraft/);
  if (!match) throw new Error("Could not locate injected extractor");
  const extractorSource = match[0].replace(/\n\nfunction encodeDraft$/, "");
  const factory = new Function("document", "location", `${extractorSource}; return extractRecipeDraft;`) as (
    document: Document,
    location: Location,
  ) => ExtractDraft;
  return factory(document, window.location);
}

describe("browser extension visible-DOM extractor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("extracts a Taste-like count-suffixed ingredients heading through a wrapper section", async () => {
    document.body.innerHTML = `
      <main><article>
        <h1>Creamy French onion chicken pasta bake</h1>
        <p>Serves 4</p>
        <div class="recipe-section">
          <div class="section-title"><h2>Ingredients <span>(3)</span></h2></div>
          <ul><li><div>250g penne pasta</div></li><li><div>1 tbsp olive oil</div></li><li><div>60g baby spinach</div></li></ul>
        </div>
        <div class="recipe-section">
          <div class="section-title"><h2>Method</h2></div>
          <ol><li><p>Cook the pasta.</p></li><li><p>Stir through the sauce.</p></li></ol>
        </div>
      </article></main>`;

    const extract = await loadInjectedExtractor();
    const draft = extract();

    expect(draft.title).toBe("Creamy French onion chicken pasta bake");
    expect(draft.servings).toBe(4);
    expect(draft.ingredients.map((ingredient) => ingredient.itemName)).toEqual([
      "250g penne pasta",
      "1 tbsp olive oil",
      "60g baby spinach",
    ]);
    expect(draft.instructions).toBe("Cook the pasta.\n\nStir through the sauce.");
  });
});
