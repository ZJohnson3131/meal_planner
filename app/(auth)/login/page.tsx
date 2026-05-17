import Link from "next/link";
import { signIn } from "@/app/actions/auth";

type AuthSearchParams = Promise<{
  error?: string | string[];
}>;

type LoginPageProps = {
  searchParams?: AuthSearchParams;
};

async function getError(searchParams?: AuthSearchParams) {
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  if (error === "invalid_credentials") {
    return "Email or password was not recognized.";
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const error = await getError(searchParams);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Meal Planner
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
            Log in
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Continue to your recipes, dinner plan, pantry, and shopping list.
          </p>
        </div>
      </div>

      <form
        action={signIn}
        aria-label="Log in"
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
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        <button
          className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          type="submit"
        >
          Log in
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Need an account?{" "}
        <Link
          className="font-medium text-emerald-800 underline-offset-4 hover:underline"
          href="/signup"
        >
          Create account
        </Link>
      </p>
    </main>
  );
}
