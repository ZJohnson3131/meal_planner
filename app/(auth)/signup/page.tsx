import Link from "next/link";
import { signUp } from "@/app/actions/auth";

type AuthSearchParams = Promise<{
  error?: string | string[];
}>;

type SignupPageProps = {
  searchParams?: AuthSearchParams;
};

async function getError(searchParams?: AuthSearchParams) {
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  if (error === "signup_failed") {
    return "We could not create that account.";
  }

  return null;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const error = await getError(searchParams);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Meal Planner
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
            Create account
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Start a household for planning dinners and tracking pantry stock.
          </p>
        </div>
      </div>

      <form
        action={signUp}
        aria-label="Create account"
        className="space-y-5"
      >
        {error ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-800"
            htmlFor="displayName"
          >
            Display name
          </label>
          <input
            autoComplete="name"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="displayName"
            name="displayName"
            required
            type="text"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-800"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="password"
            minLength={6}
            name="password"
            required
            type="password"
          />
        </div>

        <button
          className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          type="submit"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Already have an account?{" "}
        <Link
          className="font-medium text-emerald-800 underline-offset-4 hover:underline"
          href="/login"
        >
          Log in
        </Link>
      </p>
    </main>
  );
}
