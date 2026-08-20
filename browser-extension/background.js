const LOCAL_IMPORT_URL = "http://127.0.0.1:3000/recipes/import";

// Standalone WebExtension code cannot import the application's TypeScript.
// This single structured-clone-safe object mirrors recipe-import-contract.ts
// payload version 1 and is passed into the injected function as an argument.
const RECIPE_IMPORT_PROTOCOL = Object.freeze({
  recipeImportVersion: 1,
  limits: Object.freeze({
    draftBytes: 12_000,
    ingredientLineCharacters: 2_000,
    ingredients: 100,
    instructionsCharacters: 100_000,
    labelCharacters: 200,
    semanticContainerDepth: 4,
    servingsMaximum: 10_000,
    sourceUrlCharacters: 2_048,
    titleCharacters: 500,
    unitCharacters: 100,
  }),
});

function extractRecipeDraft(protocol) {
  // browser.scripting.executeScript serializes this function, while `args`
  // structured-clones the versioned contract into the isolated execution.
  const limits = protocol.limits;
  const clean = (value, maxLength) => String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const heading = (labels) => [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")]
    .find((element) => {
      const label = clean(element.textContent, limits.labelCharacters).toLowerCase();
      return labels.some((name) => label === name || label.startsWith(`${name} `) || label.startsWith(`${name}(`) || label.startsWith(`${name}:`));
    });
  const listAfter = (sectionHeading, itemCharacters) => {
    if (!sectionHeading) return [];
    let container = sectionHeading.parentElement;
    let list = null;
    for (let depth = 0; container && depth < limits.semanticContainerDepth && !list; depth += 1) {
      list = container.querySelector("ul,ol");
      container = container.parentElement;
    }
    list = list || (() => {
      let sibling = sectionHeading.nextElementSibling;
      while (sibling && !/^H[1-6]$/.test(sibling.tagName)) {
        const candidate = sibling.matches("ul,ol") ? sibling : sibling.querySelector("ul,ol");
        if (candidate) return candidate;
        sibling = sibling.nextElementSibling;
      }
      return null;
    })();
    return list
      ? [...list.querySelectorAll(":scope > li")]
        .slice(0, limits.ingredients)
        .map((item) => clean(item.textContent, itemCharacters))
        .filter(Boolean)
      : [];
  };

  const ingredientLines = listAfter(
    heading(["ingredients"]),
    limits.ingredientLineCharacters,
  );
  const methodLines = listAfter(
    heading(["method", "instructions", "directions", "preparation"]),
    limits.instructionsCharacters,
  );
  const servingsText = clean(document.body?.innerText || document.body?.textContent, limits.draftBytes);
  const servings = (servingsText.match(/(?:serves?|servings?|makes?|yield)\s*:?\s*(\d+(?:\.\d+)?)/i) || servingsText.match(/(\d+(?:\.\d+)?)\s*(?:serves?|servings?)/i))?.[1];
  const title = clean(document.querySelector("h1")?.textContent || document.querySelector("meta[property='og:title']")?.content || document.title, limits.titleCharacters);
  const sourceUrl = new URL(location.href);
  sourceUrl.hash = "";

  return {
    recipeImportVersion: protocol.recipeImportVersion,
    title: title || "Untitled recipe",
    sourceUrl: clean(sourceUrl.toString(), limits.sourceUrlCharacters),
    servings: servings ? Number(servings) : null,
    ingredients: ingredientLines.map((line) => ({ itemName: line.slice(0, limits.titleCharacters), quantity: null, unit: null, notes: line.length > limits.titleCharacters ? line : null })),
    instructions: methodLines.map((line) => line.replace(/^step\s+\d+\s*/i, "")).join("\n\n").slice(0, limits.instructionsCharacters),
  };
}

function encodeDraft(draft) {
  const { limits } = RECIPE_IMPORT_PROTOCOL;
  if (
    !draft
    || draft.recipeImportVersion !== RECIPE_IMPORT_PROTOCOL.recipeImportVersion
    || typeof draft.title !== "string"
    || draft.title.length === 0
    || draft.title.length > limits.titleCharacters
    || typeof draft.sourceUrl !== "string"
    || draft.sourceUrl.length === 0
    || draft.sourceUrl.length > limits.sourceUrlCharacters
    || typeof draft.instructions !== "string"
    || draft.instructions.length > limits.instructionsCharacters
    || (draft.servings !== null && (
      !Number.isFinite(draft.servings)
      || draft.servings <= 0
      || draft.servings > limits.servingsMaximum
    ))
    || !Array.isArray(draft.ingredients)
    || draft.ingredients.length > limits.ingredients
    || draft.ingredients.some((ingredient) => (
      !ingredient
      || typeof ingredient.itemName !== "string"
      || ingredient.itemName.length === 0
      || ingredient.itemName.length > limits.titleCharacters
      || (ingredient.quantity !== null && (
        !Number.isFinite(ingredient.quantity)
        || ingredient.quantity <= 0
      ))
      || (ingredient.unit !== null && (
        typeof ingredient.unit !== "string"
        || ingredient.unit.length > limits.unitCharacters
      ))
      || (ingredient.notes !== null && (
        typeof ingredient.notes !== "string"
        || ingredient.notes.length > limits.ingredientLineCharacters
      ))
    ))
  ) throw new Error("The visible recipe returned an unsupported draft.");

  const json = JSON.stringify(draft);
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > limits.draftBytes) {
    throw new Error("The visible recipe is too large to send as a draft.");
  }

  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("http")) return;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRecipeDraft,
      args: [RECIPE_IMPORT_PROTOCOL],
    });
    const draft = results?.[0]?.result;
    const encoded = encodeDraft(draft);
    await browser.tabs.create({ url: `${LOCAL_IMPORT_URL}#draft=${encoded}` });
  } catch (error) {
    console.error("Meal Planner import could not create a recipe draft", error);
  }
});
