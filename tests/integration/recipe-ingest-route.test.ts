import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchRecipeHtml: vi.fn(),
  validateRecipeUrl: vi.fn(),
}));

vi.mock("@/lib/recipes/safe-recipe-fetch", () => ({
  fetchRecipeHtml: mocks.fetchRecipeHtml,
  validateRecipeUrl: mocks.validateRecipeUrl,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

function request() {
  return new Request("http://127.0.0.1:3000/api/recipes/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://recipes.example/blocked" }),
  });
}

describe("recipe ingest route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetchRecipeHtml.mockReset();
    mocks.validateRecipeUrl.mockReset();
    mocks.validateRecipeUrl.mockResolvedValue({});
    mocks.fetchRecipeHtml.mockResolvedValue({ html: "<html><title>Pardon Our Interruption</title></html>", finalUrl: "https://recipes.example/blocked" });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { household_id: "household-1" }, error: null }) })) })) })) })),
    });
  });

  test("returns the explicit 422 guidance for a recognized anti-bot interstitial", async () => {
    const { POST } = await import("@/app/api/recipes/ingest/route");
    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "This site blocks automatic imports. Copy the ingredients and method into the recipe form, or use the Firefox extension while viewing the recipe.",
    });
  });
});
