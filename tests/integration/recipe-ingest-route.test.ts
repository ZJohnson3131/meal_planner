import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireRecipeIngestAdmission: vi.fn(),
  createClient: vi.fn(),
  fetchRecipeHtml: vi.fn(),
  releaseAdmission: vi.fn(),
  validateRecipeUrl: vi.fn(),
}));

vi.mock("@/lib/recipes/ingest-admission", () => ({
  acquireRecipeIngestAdmission: mocks.acquireRecipeIngestAdmission,
}));
vi.mock("@/lib/recipes/safe-recipe-fetch", () => ({
  fetchRecipeHtml: mocks.fetchRecipeHtml,
  validateRecipeUrl: mocks.validateRecipeUrl,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

function request(options: { body?: unknown; origin?: string } = {}) {
  return new Request("http://127.0.0.1:3000/api/recipes/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.origin ? { origin: options.origin } : {}),
    },
    body: JSON.stringify(options.body ?? { url: "https://recipes.example/blocked" }),
  });
}

describe("recipe ingest route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.acquireRecipeIngestAdmission.mockReset();
    mocks.fetchRecipeHtml.mockReset();
    mocks.releaseAdmission.mockReset();
    mocks.validateRecipeUrl.mockReset();
    mocks.createClient.mockReset();
    mocks.validateRecipeUrl.mockResolvedValue({});
    mocks.fetchRecipeHtml.mockResolvedValue({ html: "<html><title>Pardon Our Interruption</title></html>", finalUrl: "https://recipes.example/blocked" });
    mocks.acquireRecipeIngestAdmission.mockReturnValue({ release: mocks.releaseAdmission });
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
    expect(mocks.acquireRecipeIngestAdmission).toHaveBeenCalledWith("user-1", "household-1");
    expect(mocks.releaseAdmission).toHaveBeenCalledOnce();
  });

  test("rejects cross-origin requests before authentication or fetching", async () => {
    const { POST } = await import("@/app/api/recipes/ingest/route");
    const response = await POST(request({ origin: "https://attacker.example" }));

    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.fetchRecipeHtml).not.toHaveBeenCalled();
  });

  test("returns a versioned contract and redacts sensitive query values on fetch failure", async () => {
    mocks.fetchRecipeHtml.mockRejectedValue(new Error("network failed"));
    const { POST } = await import("@/app/api/recipes/ingest/route");
    const response = await POST(request({ body: {
      url: "https://recipes.example/soup?utm_source=test&token=secret&userEmail=a%40b.test#method",
    } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recipeImportVersion: 1,
      sourceUrl: "https://recipes.example/soup?utm_source=test",
      ingestionStatus: "failed",
    });
    expect(mocks.releaseAdmission).toHaveBeenCalledOnce();
  });

  test("rejects a streamed request over 4 KiB without relying on Content-Length", async () => {
    const oversizedRequest = request({ body: {
      padding: "x".repeat(4_096),
      url: "https://recipes.example/oversized",
    } });
    expect(oversizedRequest.headers.has("content-length")).toBe(false);
    const { POST } = await import("@/app/api/recipes/ingest/route");

    const response = await POST(oversizedRequest);

    expect(response.status).toBe(413);
    expect(mocks.acquireRecipeIngestAdmission).not.toHaveBeenCalled();
    expect(mocks.fetchRecipeHtml).not.toHaveBeenCalled();
  });

  test("returns 429 without fetching when the principal has no admission capacity", async () => {
    mocks.acquireRecipeIngestAdmission.mockReturnValue(null);
    const { POST } = await import("@/app/api/recipes/ingest/route");

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Recipe import is temporarily unavailable. Try again later.",
    });
    expect(mocks.fetchRecipeHtml).not.toHaveBeenCalled();
    expect(mocks.releaseAdmission).not.toHaveBeenCalled();
  });
});
