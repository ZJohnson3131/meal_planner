import Link from "next/link";
import { signOut } from "@/app/actions/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/recipes", label: "Recipes" },
  { href: "/planner", label: "Planner" },
  { href: "/pantry", label: "Pantry" },
  { href: "/shopping", label: "Shopping" },
];

export function AppNav() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-soft-border bg-cream px-6 py-3">
      <Link className="font-semibold text-espresso" href="/dashboard">
        Meal Planner
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {links.map((link) => (
          <Link
            className="text-sm text-espresso/75 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
        <form action={signOut}>
          <button
            className="text-sm text-espresso/75 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
