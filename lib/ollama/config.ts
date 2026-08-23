import "server-only";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export type OllamaConfiguration = {
  baseUrl: URL;
  model: string;
};

/**
 * Ollama is deliberately restricted to a local HTTP listener. This module is
 * server-only so environment configuration can never become a browser proxy.
 */
export function getOllamaConfiguration(): OllamaConfiguration {
  const rawBaseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.OLLAMA_MODEL?.trim();
  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error("Ollama is not configured. Set OLLAMA_BASE_URL to a local URL.");
  }

  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  if (
    baseUrl.protocol !== "http:"
    || !loopbackHosts.has(baseUrl.hostname.toLowerCase())
    || baseUrl.username
    || baseUrl.password
    || baseUrl.pathname !== "/"
    || baseUrl.search
    || baseUrl.hash
  ) {
    throw new Error("OLLAMA_BASE_URL must be an HTTP loopback URL without credentials.");
  }
  if (!model) {
    throw new Error("Ollama model is not configured. Set OLLAMA_MODEL after pulling a local model.");
  }

  return { baseUrl, model };
}
