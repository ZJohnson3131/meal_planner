import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/database.types";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/recipes",
  "/pantry",
  "/planner",
  "/shopping",
] as const;

export function isProtectedAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers = new Headers(request.headers),
) {
  const sessionResponseHeaders = new Headers();
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const applySessionHeaders = (target: NextResponse) => {
    sessionResponseHeaders.forEach((value, key) => {
      target.headers.set(key, value);
    });
  };

  // Proxy covers public HTML for CSP nonce injection. This early return is a
  // defense-in-depth guarantee that public requests never trigger auth I/O.
  if (!isProtectedAppRoute(request.nextUrl.pathname)) return response;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet = {}) {
          const existingResponseCookies = response.cookies.getAll();
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          // NextResponse.next forwards the explicit Headers instance, not the
          // mutated NextRequest cookie store. Synchronize Cookie first so the
          // current render observes a token refreshed by getUser().
          requestHeaders.set("cookie", request.cookies.toString());

          Object.entries(headersToSet).forEach(([key, value]) => {
            sessionResponseHeaders.set(key, value);
          });

          response = NextResponse.next({ request: { headers: requestHeaders } });
          existingResponseCookies.forEach((cookie) => {
            response.cookies.set(cookie);
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          });
          applySessionHeaders(response);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    applySessionHeaders(redirectResponse);
    return redirectResponse;
  }

  return response;
}
