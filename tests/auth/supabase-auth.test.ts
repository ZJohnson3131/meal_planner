import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("server-only", () => ({}));

describe("Supabase auth proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getUser.mockReset();
    mocks.createServerClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: mocks.getUser,
      },
    });
  });

  test("redirects unauthenticated app routes to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { proxy } = await import("@/proxy");

    const response = await proxy(
      new NextRequest("http://localhost:3000/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  test("allows public routes without a user", async () => {
    const { proxy } = await import("@/proxy");

    const response = await proxy(new NextRequest("http://localhost:3000/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  test("the proxy matcher covers HTML broadly while excluding APIs and static assets", async () => {
    const { config } = await import("@/proxy");

    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toMatchObject({
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    });
    expect(config.matcher[0].source).toContain("api(?:/|$)");
    expect(config.matcher[0].source).toContain("_next/static");
    expect(config.matcher[0].source).toContain(".*\\.[^/]+$");
  });

  test("generates a unique nonce-only CSP for each public HTML request without auth I/O", async () => {
    const { proxy } = await import("@/proxy");

    const first = await proxy(new NextRequest("http://localhost:3000/login"));
    const second = await proxy(new NextRequest("http://localhost:3000/signup"));
    const firstPolicy = first.headers.get("content-security-policy") ?? "";
    const secondPolicy = second.headers.get("content-security-policy") ?? "";
    const firstNonce = firstPolicy.match(/'nonce-([^']+)'/)?.[1];
    const secondNonce = secondPolicy.match(/'nonce-([^']+)'/)?.[1];

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
    expect(firstPolicy).not.toContain("'unsafe-inline'");
    expect(secondPolicy).not.toContain("'unsafe-inline'");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  test("hardens and forwards refreshed auth cookies without caching the response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{
        name: "sb-session",
        value: "opaque",
        options: { path: "/" },
      }], {
        "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
        expires: "0",
        pragma: "no-cache",
        "x-supabase-refresh": "applied",
      });
      return { auth: { getUser: mocks.getUser } };
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { proxy } = await import("@/proxy");

    const response = await proxy(new NextRequest(
      "https://meal-planner.example/dashboard",
      { headers: { cookie: "theme=dark; sb-session=stale" } },
    ));
    const cookie = response.headers.get("set-cookie") ?? "";
    const forwardedCookie = response.headers.get("x-middleware-request-cookie") ?? "";

    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(forwardedCookie).toContain("theme=dark");
    expect(forwardedCookie).toContain("sb-session=opaque");
    expect(forwardedCookie).not.toContain("sb-session=stale");
    expect(response.headers.get("x-supabase-refresh")).toBe("applied");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
