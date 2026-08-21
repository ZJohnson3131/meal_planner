import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: mocks.request }));

type Reply = {
  body?: Buffer[];
  headers: Record<string, string>;
  statusCode: number;
};

function installReplies(replies: Reply[]) {
  let index = 0;
  mocks.request.mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & {
      destroy(error?: Error): void;
      end(): void;
    };
    request.destroy = (error?: Error) => {
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    request.end = () => {
      const reply = replies[index++];
      if (!reply) throw new Error("No mock HTTPS reply configured");
      queueMicrotask(() => {
        let destroyed = false;
        const response = new EventEmitter() as EventEmitter & {
          destroy(error?: Error): void;
          headers: Record<string, string>;
          statusCode: number;
        };
        response.statusCode = reply.statusCode;
        response.headers = reply.headers;
        response.destroy = (error?: Error) => {
          destroyed = true;
          if (error) queueMicrotask(() => response.emit("error", error));
        };
        callback(response);
        for (const chunk of reply.body ?? []) {
          if (destroyed) break;
          response.emit("data", chunk);
        }
        if (!destroyed) response.emit("end");
      });
    };
    return request;
  });
}

describe("safe recipe fetch", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.request.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("revalidates and pins every redirect target", async () => {
    installReplies([
      { statusCode: 302, headers: { location: "https://8.8.4.4/final" } },
      { statusCode: 200, headers: { "content-type": "text/html" }, body: [Buffer.from("<h1>Recipe</h1>")] },
    ]);
    const { fetchRecipeHtml } = await import("@/lib/recipes/safe-recipe-fetch");

    await expect(fetchRecipeHtml("https://8.8.8.8/start")).resolves.toMatchObject({
      finalUrl: "https://8.8.4.4/final",
      html: "<h1>Recipe</h1>",
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[0][1].lookup).toBeTypeOf("function");
    expect(mocks.request.mock.calls[1][1].lookup).toBeTypeOf("function");
  });

  test("rejects redirects to loopback before issuing the second request", async () => {
    installReplies([{ statusCode: 302, headers: { location: "https://127.0.0.1/private" } }]);
    const { fetchRecipeHtml, RecipeFetchError } = await import("@/lib/recipes/safe-recipe-fetch");

    await expect(fetchRecipeHtml("https://8.8.8.8/start")).rejects.toBeInstanceOf(RecipeFetchError);
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  test("rejects non-HTML media before consuming a response body", async () => {
    installReplies([{ statusCode: 200, headers: { "content-type": "application/json" }, body: [Buffer.from("{\"secret\":true}")] }]);
    const { fetchRecipeHtml, RecipeFetchError } = await import("@/lib/recipes/safe-recipe-fetch");

    await expect(fetchRecipeHtml("https://8.8.8.8/recipe")).rejects.toBeInstanceOf(RecipeFetchError);
  });

  test("enforces the one aggregate deadline during DNS and request stages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00Z"));
    const {
      createRecipeImportBudget,
      RecipeImportDeadlineError,
    } = await import("@/lib/recipes/recipe-import-contract");
    const { fetchRecipeHtml, validateRecipeUrl } = await import("@/lib/recipes/safe-recipe-fetch");

    const dnsBudget = createRecipeImportBudget(10);
    const pendingDns = validateRecipeUrl(
      "https://recipes.example/recipe",
      vi.fn(() => new Promise(() => {})) as never,
      dnsBudget,
    );
    const dnsRejection = expect(pendingDns).rejects.toBeInstanceOf(RecipeImportDeadlineError);
    await vi.advanceTimersByTimeAsync(11);
    await dnsRejection;

    mocks.request.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & { destroy(error?: Error): void; end(): void };
      request.end = () => {};
      request.destroy = (error?: Error) => {
        if (error) queueMicrotask(() => request.emit("error", error));
      };
      return request;
    });
    const requestBudget = createRecipeImportBudget(10);
    const pendingRequest = fetchRecipeHtml("https://8.8.8.8/recipe", requestBudget);
    const requestRejection = expect(pendingRequest).rejects.toThrow("Recipe import timed out");
    await vi.advanceTimersByTimeAsync(11);
    await requestRejection;
  });

  test("rejects declared and streamed bodies over the byte limit", async () => {
    const { RECIPE_IMPORT_LIMITS } = await import("@/lib/recipes/recipe-import-contract");
    const { fetchRecipeHtml, RecipeFetchError } = await import("@/lib/recipes/safe-recipe-fetch");
    installReplies([{ statusCode: 200, headers: {
      "content-type": "text/html",
      "content-length": String(RECIPE_IMPORT_LIMITS.htmlBytes + 1),
    } }]);
    await expect(fetchRecipeHtml("https://8.8.8.8/declared")).rejects.toBeInstanceOf(RecipeFetchError);

    mocks.request.mockReset();
    installReplies([{ statusCode: 200, headers: { "content-type": "text/html" }, body: [
      Buffer.alloc(RECIPE_IMPORT_LIMITS.htmlBytes),
      Buffer.from("x"),
    ] }]);
    await expect(fetchRecipeHtml("https://8.8.8.8/streamed")).rejects.toBeInstanceOf(RecipeFetchError);
  });
});
