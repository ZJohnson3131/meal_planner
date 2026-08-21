import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalBaseUrl = process.env.OLLAMA_BASE_URL;
const originalModel = process.env.OLLAMA_MODEL;

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, ...init });
}

describe("local Ollama client", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "qwen3";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL; else process.env.OLLAMA_MODEL = originalModel;
  });

  test("rejects a non-loopback runtime configuration before it can be used", async () => {
    process.env.OLLAMA_BASE_URL = "https://models.example.com";
    const { getOllamaConfiguration } = await import("@/lib/ollama/config");

    expect(() => getOllamaConfiguration()).toThrow("HTTP loopback URL");
  });

  test("reports an actionable missing-model status", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ models: [{ name: "llama3:latest" }] }));
    const { getOllamaReadiness } = await import("@/lib/ollama/client");

    await expect(getOllamaReadiness()).resolves.toEqual({
      status: "model_missing",
      message: "The local Ollama model \"qwen3\" is not installed. Run: ollama pull qwen3",
    });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:11434/api/tags", expect.objectContaining({ cache: "no-store" }));
  });

  test("returns a safe, local-runtime error when generation is unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("connection refused"));
    const { generateWithOllama } = await import("@/lib/ollama/client");

    await expect(generateWithOllama("make a plan")).rejects.toThrow("Ollama is unavailable. Start it locally and try again.");
  });

  test("rejects malformed or oversized generation responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("not json", { headers: { "content-length": "8" } }))
      .mockResolvedValueOnce(jsonResponse({ response: "x" }, { headers: { "content-length": "999999" } }));
    const { generateWithOllama } = await import("@/lib/ollama/client");

    await expect(generateWithOllama("make a plan")).rejects.toThrow("malformed JSON");
    await expect(generateWithOllama("make a plan")).rejects.toThrow("too large");
  });
});
