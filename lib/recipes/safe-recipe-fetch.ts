import "server-only";

import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

type ResolvedAddress = { address: string; family: 4 | 6 };

export class RecipeFetchError extends Error {}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = parts;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("2001:db8:")
  ) {
    return false;
  }

  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPublicIpv4(mappedIpv4) : true;
}

function isPublicAddress(address: string, family: number): boolean {
  return family === 4 ? isPublicIpv4(address) : family === 6 && isPublicIpv6(address);
}

export async function validateRecipeUrl(rawUrl: string): Promise<{ url: URL; address: ResolvedAddress }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RecipeFetchError("Invalid recipe URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "443") ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new RecipeFetchError("Unsupported recipe URL");
  }

  const literalFamily = isIP(url.hostname);
  const resolvedAddresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily as 4 | 6 }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  const addresses = resolvedAddresses.filter(
    (candidate): candidate is ResolvedAddress => candidate.family === 4 || candidate.family === 6,
  );

  if (addresses.length === 0 || addresses.some(({ address, family }) => !isPublicAddress(address, family))) {
    throw new RecipeFetchError("Recipe URL does not resolve to a public address");
  }

  return { url, address: addresses[0] };
}

function requestHtml(url: URL, address: ResolvedAddress): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const deadline: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined };
    const clearDeadline = () => {
      if (deadline.timer) clearTimeout(deadline.timer);
    };
    const request = https.request(
      url,
      {
        headers: { Accept: "text/html,application/xhtml+xml" },
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const contentLength = Number(response.headers["content-length"] ?? 0);

        if (contentLength > MAX_RESPONSE_BYTES) {
          clearDeadline();
          response.destroy();
          reject(new RecipeFetchError("Recipe response is too large"));
          return;
        }

        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy(new RecipeFetchError("Recipe response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          clearDeadline();
          resolve({
            statusCode: response.statusCode ?? 500,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", (error) => {
          clearDeadline();
          reject(error);
        });
      },
    );

    deadline.timer = setTimeout(
      () => request.destroy(new RecipeFetchError("Recipe request timed out")),
      REQUEST_TIMEOUT_MS,
    );
    request.on("error", (error) => {
      clearDeadline();
      reject(error);
    });
    request.end();
  });
}

export async function fetchRecipeHtml(initialUrl: string): Promise<{ html: string; finalUrl: string }> {
  let candidateUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const { url, address } = await validateRecipeUrl(candidateUrl);
    const response = await requestHtml(url, address);

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers.location;
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new RecipeFetchError("Recipe redirect failed");
      }
      candidateUrl = new URL(location, url).toString();
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RecipeFetchError("Recipe request failed");
    }

    const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new RecipeFetchError("Recipe response is not HTML");
    }

    return { html: response.body, finalUrl: url.toString() };
  }

  throw new RecipeFetchError("Recipe redirect failed");
}
