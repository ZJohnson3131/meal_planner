import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

describe("auth pages", () => {
  test("login page renders an email and password form with signup navigation", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;

    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    const form = screen.getByRole("form", { name: "Log in" });
    expect(within(form).getByLabelText("Email")).toHaveAttribute(
      "type",
      "email",
    );
    expect(within(form).getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      within(form).getByRole("button", { name: "Log in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  test("login page displays invalid credential errors from search params", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;

    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "invalid_credentials" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email or password was not recognized.",
    );
  });

  test("signup page renders display name, email, and password fields", async () => {
    const SignupPage = (await import("@/app/(auth)/signup/page")).default;

    render(await SignupPage({ searchParams: Promise.resolve({}) }));

    const form = screen.getByRole("form", { name: "Create account" });
    expect(within(form).getByLabelText("Display name")).toHaveAttribute(
      "name",
      "displayName",
    );
    expect(within(form).getByLabelText("Email")).toHaveAttribute(
      "type",
      "email",
    );
    expect(within(form).getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("signup page displays signup errors from search params", async () => {
    const SignupPage = (await import("@/app/(auth)/signup/page")).default;

    render(
      await SignupPage({
        searchParams: Promise.resolve({ error: "signup_failed" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not create that account.",
    );
  });
});
