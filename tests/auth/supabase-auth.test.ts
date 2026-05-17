import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock("server-only", () => ({}));

describe("Supabase auth proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getUser.mockReset();
    mocks.createServerClient.mockReset();
    mocks.createSupabaseClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { proxy } = await import("@/proxy");

    const response = await proxy(new NextRequest("http://localhost:3000/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("creates service clients only when the service role key is present", async () => {
    const { createServiceClient } = await import("@/lib/supabase/service");

    expect(() => createServiceClient()).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY is required on the server",
    );

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    createServiceClient();

    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  });
});
