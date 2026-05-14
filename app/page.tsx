import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Meal Planner
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-slate-950">
          Plan dinners, track your pantry, and generate shopping lists.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          A local-first MVP for managing recipes, weekly dinners, pantry stock,
          and the gap between what you have and what you need.
        </p>
      </div>
      <div className="flex gap-3">
        <Link className="rounded-md bg-emerald-700 px-4 py-2 text-white" href="/login">
          Log in
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2" href="/signup">
          Create account
        </Link>
      </div>
    </main>
  );
}
