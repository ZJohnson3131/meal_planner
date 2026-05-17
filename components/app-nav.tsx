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
    <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
      <Link className="font-semibold text-slate-950" href="/dashboard">
        Meal Planner
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {links.map((link) => (
          <Link
            className="text-sm text-slate-700 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
        <form action={signOut}>
          <button
            className="text-sm text-slate-700 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
