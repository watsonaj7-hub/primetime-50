import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config/public";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const protectedPrefixes = ["/admin", "/workout", "/nutrition", "/progress", "/coach", "/settings", "/onboarding"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (request.nextUrl.pathname.startsWith("/api/")) return response;
  const isProtected = protectedPrefixes.some(prefix => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  const config = supabaseConfig();
  const loginRedirect = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };
  if (!config) return isProtected ? loginRedirect() : response;
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (isProtected && !user) return loginRedirect();
    if (user && (request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/"))) {
      const { data, error } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (error || data?.role !== "admin") return new NextResponse("Access denied.", { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
  } catch {
    if (isProtected) return loginRedirect();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
