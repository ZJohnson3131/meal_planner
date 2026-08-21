import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";

const createRequestClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headersToSet = {}) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          });

          // Next's headers() API is read-only, so a shared Server Component /
          // Server Function client cannot safely mutate outgoing response
          // headers here. Proxy applies these headers during refresh; Next also
          // marks dynamic renders and Server Action responses private/no-store.
          void headersToSet;
        },
      },
    },
  );
});

/** Reuses one authenticated Supabase client within a server request. */
export async function createClient() {
  return createRequestClient();
}
