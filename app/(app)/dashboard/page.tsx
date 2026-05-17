import Link from "next/link";

const dashboardLinks = [
  {
    href: "/recipes",
    label: "Recipes",
    description: "Capture manual recipes and prepare for URL imports.",
  },
  {
    href: "/planner",
    label: "Planner",
    description: "Build a dinner-only weekly plan for the household.",
  },
  {
    href: "/pantry",
    label: "Pantry",
    description: "Track available ingredients before generating lists.",
  },
  {
    href: "/shopping",
    label: "Shopping",
    description: "Review what planned dinners need beyond pantry stock.",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Dashboard
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Use the MVP sections below to move from recipes to planning, pantry
          tracking, and a focused shopping list.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardLinks.map((link) => (
          <Link
            aria-label={link.label}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            href={link.href}
            key={link.href}
          >
            <span className="text-lg font-semibold text-slate-950">
              {link.label}
            </span>
            <span className="mt-3 block text-sm leading-6 text-slate-600">
              {link.description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
