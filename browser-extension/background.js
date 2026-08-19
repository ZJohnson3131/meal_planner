const LOCAL_IMPORT_URL = "http://127.0.0.1:3000/recipes/import";
const MAX_DRAFT_BYTES = 12_000;
const MAX_INGREDIENTS = 100;

function extractRecipeDraft() {
  const clean = (value, maxLength) => String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const heading = (labels) => [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")]
    .find((element) => labels.includes(clean(element.textContent, 100).toLowerCase()));
  const listAfter = (sectionHeading) => {
    if (!sectionHeading) return [];
    const section = sectionHeading.parentElement;
    const list = section?.querySelector("ul,ol") || (() => {
      let sibling = sectionHeading.nextElementSibling;
      while (sibling && !/^H[1-6]$/.test(sibling.tagName)) {
        const candidate = sibling.matches("ul,ol") ? sibling : sibling.querySelector("ul,ol");
        if (candidate) return candidate;
        sibling = sibling.nextElementSibling;
      }
      return null;
    })();
    return list ? [...list.querySelectorAll(":scope > li")].slice(0, MAX_INGREDIENTS).map((item) => clean(item.textContent, 2_000)).filter(Boolean) : [];
  };
  const ingredientLines = listAfter(heading(["ingredients"]));
  const methodLines = listAfter(heading(["method", "instructions", "directions", "preparation"]));
  const servingsText = clean(document.body?.innerText, MAX_DRAFT_BYTES);
  const servings = (servingsText.match(/(?:serves?|servings?|makes?|yield)\s*:?\s*(\d+(?:\.\d+)?)/i) || servingsText.match(/(\d+(?:\.\d+)?)\s*(?:serves?|servings?)/i))?.[1];
  const title = clean(document.querySelector("h1")?.textContent || document.querySelector("meta[property='og:title']")?.content || document.title, 500);
  return {
    title: title || "Untitled recipe",
    sourceUrl: location.href,
    servings: servings ? Number(servings) : null,
    ingredients: ingredientLines.map((line) => ({ itemName: line, quantity: null, unit: null, notes: null })),
    instructions: methodLines.map((line) => line.replace(/^step\s+\d+\s*/i, "")).join("\n\n"),
  };
}

function encodeDraft(draft) {
  const json = JSON.stringify(draft);
  if (new TextEncoder().encode(json).length > MAX_DRAFT_BYTES) throw new Error("The visible recipe is too large to send as a draft.");
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("http")) return;
  try {
    const [{ result: draft }] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: extractRecipeDraft });
    const encoded = encodeDraft(draft);
    await browser.tabs.create({ url: `${LOCAL_IMPORT_URL}#draft=${encoded}` });
  } catch (error) {
    console.error("Meal Planner import could not create a recipe draft", error);
  }
});
