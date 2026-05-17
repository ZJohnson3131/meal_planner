import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
  createSupabaseClient: vi.fn(),
  cookies: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
  createServerClient: mocks.createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("Supabase client wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  test("creates the browser client from public Supabase env vars", async () => {
    const browserClient = { kind: "browser-client" };
    mocks.createBrowserClient.mockReturnValue(browserClient);

    const { createClient } = await import("@/lib/supabase/browser");

    expect(createClient()).toBe(browserClient);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "anon-key",
    );
  });

  test("creates the server client with async cookie get and set handlers", async () => {
    const cookieStore = {
      getAll: vi.fn(() => [{ name: "sb-session", value: "old" }]),
      set: vi.fn(),
    };
    const serverClient = { kind: "server-client" };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockReturnValue(serverClient);

    const { createClient } = await import("@/lib/supabase/server");

    expect(await createClient()).toBe(serverClient);
    const [, , options] = mocks.createServerClient.mock.calls[0];
    expect(options.cookies.getAll()).toEqual([
      { name: "sb-session", value: "old" },
    ]);

    options.cookies.setAll([
      { name: "sb-session", value: "new", options: { httpOnly: true } },
    ]);

    expect(cookieStore.set).toHaveBeenCalledWith("sb-session", "new", {
      httpOnly: true,
    });
  });

  test("does not fail when a server component context rejects cookie writes", async () => {
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("Cookies can only be modified in a Server Action");
      }),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockReturnValue({ kind: "server-client" });

    const { createClient } = await import("@/lib/supabase/server");

    await createClient();
    const [, , options] = mocks.createServerClient.mock.calls[0];

    expect(() => {
      options.cookies.setAll([
        { name: "sb-session", value: "new", options: { httpOnly: true } },
      ]);
    }).not.toThrow();
  });

  test("creates a non-persistent service-role client only when the server secret is present", async () => {
    const serviceClient = { kind: "service-client" };
    mocks.createSupabaseClient.mockReturnValue(serviceClient);

    const { createServiceClient } = await import("@/lib/supabase/service");

    expect(createServiceClient()).toBe(serviceClient);
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

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createServiceClient()).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY is required on the server",
    );
  });
});

describe("auth guards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mocks.cookies.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
  });

  test("requireUser returns the authenticated Supabase user", async () => {
    const user = { id: "user-1", email: "cook@example.com" };
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    });

    const { requireUser } = await import("@/lib/auth/require-user");

    expect(await requireUser()).toBe(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("requireUser redirects unauthenticated users to login", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { requireUser } = await import("@/lib/auth/require-user");

    await expect(requireUser()).rejects.toThrow("redirect:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  test("requireHousehold returns the current user's household context", async () => {
    const user = { id: "user-1", email: "cook@example.com" };
    const membershipQuery = {
      select: vi.fn(() => membershipQuery),
      eq: vi.fn(() => membershipQuery),
      limit: vi.fn(() => membershipQuery),
      single: vi
        .fn()
        .mockResolvedValue({ data: { household_id: "household-1" }, error: null }),
    };
    const from = vi.fn(() => membershipQuery);
    mocks.createServerClient
      .mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        },
      })
      .mockReturnValueOnce({ from });

    const { requireHousehold } = await import("@/lib/auth/household");

    await expect(requireHousehold()).resolves.toEqual({
      userId: "user-1",
      householdId: "household-1",
    });
    expect(from).toHaveBeenCalledWith("household_memberships");
    expect(membershipQuery.select).toHaveBeenCalledWith("household_id");
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("Supabase proxy session refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  test("redirects unauthenticated app route requests to login", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(
      new NextRequest("https://meal.test/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://meal.test/login");
  });

  test("preserves refreshed Supabase cookies when redirecting to login", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([
        {
          name: "sb-session",
          value: "",
          options: { maxAge: 0, path: "/" },
        },
      ]);

      return {
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({ data: { user: null }, error: null }),
        },
      };
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(
      new NextRequest("https://meal.test/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-session")?.value).toBe("");
  });

  test("allows public route requests without a user", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(new NextRequest("https://meal.test/"));

    expect(response.status).toBe(200);
  });

  test("refreshes Supabase cookies on authenticated app route requests", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([
        {
          name: "sb-session",
          value: "fresh",
          options: { httpOnly: true, path: "/" },
        },
      ]);

      return {
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
        },
      };
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const response = await updateSession(
      new NextRequest("https://meal.test/recipes"),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-session")?.value).toBe("fresh");
  });
});

describe("root proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  test("exports the Next.js 16 proxy entry point and matcher", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
    });

    const { config, proxy } = await import("@/proxy");

    expect(typeof proxy).toBe("function");
    expect(config).toEqual({
      matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
    });

    const response = await proxy(new NextRequest("https://meal.test/pantry"));
    expect(response.status).toBe(200);
  });
});
