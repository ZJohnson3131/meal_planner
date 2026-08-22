import "server-only";

import { getOllamaConfiguration } from "@/lib/ollama/config";

// Model loading and multi-recipe JSON generation can take noticeably longer
// than a readiness check on consumer hardware. Keep each operation bounded,
// but give generation enough time to complete instead of treating a healthy
// local model as unavailable.
const READINESS_TIMEOUT_MS = 10_000;
const GENERATION_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

type OllamaTagsResponse = { models?: Array<{ name?: string }> };
type OllamaGenerateResponse = { response?: string };

export type OllamaReadiness =
  | { status: "ready" }
  | { status: "unavailable"; message: string }
  | { status: "model_missing"; message: string };

export class OllamaGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaGenerationError";
  }
}

function endpoint(path: "/api/tags" | "/api/generate") {
  const { baseUrl } = getOllamaConfiguration();
  return new URL(path, baseUrl).toString();
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new OllamaGenerationError("Ollama returned a response that is too large.");
  }
  if (!response.body) throw new OllamaGenerationError("Ollama returned an empty response.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new OllamaGenerationError("Ollama returned a response that is too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw new OllamaGenerationError("Ollama returned malformed JSON.");
  }
}

async function ollamaFetch(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new OllamaGenerationError("Ollama did not respond in time. Check that it is running locally.");
    }
    throw new OllamaGenerationError("Ollama is unavailable. Start it locally and try again.");
  }
}

/** Checks only the configured local runtime and configured model name. */
export async function getOllamaReadiness(): Promise<OllamaReadiness> {
  let model: string;
  try {
    ({ model } = getOllamaConfiguration());
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Ollama is not configured." };
  }

  try {
    const response = await ollamaFetch(endpoint("/api/tags"), READINESS_TIMEOUT_MS);
    if (!response.ok) return { status: "unavailable", message: "Ollama is unavailable. Start it locally and try again." };
    const payload = await boundedJson(response) as OllamaTagsResponse;
    if (!payload.models?.some((candidate) => candidate.name === model || candidate.name === `${model}:latest`)) {
      return { status: "model_missing", message: `The local Ollama model \"${model}\" is not installed. Run: ollama pull ${model}` };
    }
    return { status: "ready" };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Ollama is unavailable." };
  }
}

/** Sends a fixed, non-proxy generation request to the local Ollama API. */
export async function generateWithOllama(prompt: string): Promise<string> {
  const { model } = getOllamaConfiguration();
  const response = await ollamaFetch(endpoint("/api/generate"), GENERATION_TIMEOUT_MS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Qwen3 otherwise spends tokens on a private reasoning trace before it
    // emits the schema-bound result. This is a local, server-only request;
    // `think: false` keeps the response focused while the timeout remains an
    // absolute upper bound for slower machines.
    body: JSON.stringify({ model, prompt, stream: false, format: "json", think: false, options: { temperature: 0.3 } }),
  });
  if (!response.ok) throw new OllamaGenerationError("Ollama could not generate a plan. Check the local model and try again.");
  const payload = await boundedJson(response) as OllamaGenerateResponse;
  if (typeof payload.response !== "string" || !payload.response.trim()) {
    throw new OllamaGenerationError("Ollama returned no recipe drafts.");
  }
  return payload.response;
}
