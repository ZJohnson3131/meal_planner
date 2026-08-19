import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("browser extension manifest", () => {
  test("is valid MV3 JSON with only the needed active-tab extraction permissions", async () => {
    const manifest = JSON.parse(await readFile(resolve(process.cwd(), "browser-extension/manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting"]);
    expect(manifest.action).toEqual(expect.objectContaining({ default_title: expect.any(String) }));
  });
});
