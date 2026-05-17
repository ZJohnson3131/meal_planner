import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHousehold: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({
  requireHousehold: mocks.requireHousehold,
}));

vi.mock("@/app/actions/auth", () => ({
  signOut: mocks.signOut,
}));

describe("app shell", () => {
  test("renders primary app navigation and a sign-out form", async () => {
    const { AppNav } = await import("@/components/app-nav");

    render(<AppNav />);

    expect(screen.getByRole("link", { name: "Meal Planner" })).toHaveAttribute(
      "href",
      "/dashboard",
    );

    for (const [name, href] of [
      ["Dashboard", "/dashboard"],
      ["Recipes", "/recipes"],
      ["Planner", "/planner"],
      ["Pantry", "/pantry"],
      ["Shopping", "/shopping"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }

    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  test("protected layout requires a household before rendering children", async () => {
    mocks.requireHousehold.mockResolvedValue({
      householdId: "household-id",
      userId: "user-id",
    });
    const ProtectedLayout = (await import("@/app/(app)/layout")).default;

    render(await ProtectedLayout({ children: <p>Protected content</p> }));

    expect(mocks.requireHousehold).toHaveBeenCalled();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  test("dashboard links to current MVP surfaces", async () => {
    const DashboardPage = (await import("@/app/(app)/dashboard/page")).default;

    render(<DashboardPage />);

    for (const [name, href] of [
      ["Recipes", "/recipes"],
      ["Planner", "/planner"],
      ["Pantry", "/pantry"],
      ["Shopping", "/shopping"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
