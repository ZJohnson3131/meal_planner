import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

function formData(values: Record<string, string>) {
  const data = new FormData();

  Object.entries(values).forEach(([key, value]) => {
    data.set(key, value);
  });

  return data;
}

describe("auth actions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.redirect.mockClear();
    mocks.signInWithPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.signUp.mockReset();

    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        signUp: mocks.signUp,
      },
    });
  });

  test("signs in with credentials and redirects to the dashboard", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const { signIn } = await import("@/app/actions/auth");

    await expect(
      signIn(formData({ email: "cook@example.com", password: "secret123" })),
    ).rejects.toThrow("redirect:/dashboard");

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "cook@example.com",
      password: "secret123",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  test("redirects failed sign-ins back to login with an error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error("invalid credentials"),
    });
    const { signIn } = await import("@/app/actions/auth");

    await expect(
      signIn(formData({ email: "cook@example.com", password: "wrong" })),
    ).rejects.toThrow("redirect:/login?error=invalid_credentials");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?error=invalid_credentials",
    );
  });

  test("signs up with display metadata and redirects to the dashboard", async () => {
    mocks.signUp.mockResolvedValue({ error: null });
    const { signUp } = await import("@/app/actions/auth");

    await expect(
      signUp(
        formData({
          displayName: "Home Cook",
          email: "cook@example.com",
          password: "secret123",
        }),
      ),
    ).rejects.toThrow("redirect:/dashboard");

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "cook@example.com",
      password: "secret123",
      options: { data: { display_name: "Home Cook" } },
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  test("redirects failed sign-ups back to signup with an error", async () => {
    mocks.signUp.mockResolvedValue({ error: new Error("signup failed") });
    const { signUp } = await import("@/app/actions/auth");

    await expect(
      signUp(
        formData({
          displayName: "Home Cook",
          email: "cook@example.com",
          password: "secret123",
        }),
      ),
    ).rejects.toThrow("redirect:/signup?error=signup_failed");

    expect(mocks.redirect).toHaveBeenCalledWith("/signup?error=signup_failed");
  });

  test("signs out and redirects home", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    const { signOut } = await import("@/app/actions/auth");

    await expect(signOut()).rejects.toThrow("redirect:/");

    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
