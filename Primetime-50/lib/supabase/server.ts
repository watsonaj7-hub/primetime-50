import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/lib/db/database.types";
import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config/public";
import { AppError } from "@/lib/http/errors";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createClient() {
  const cookieStore = await cookies();
  const config = supabaseConfig();
  if (!config) throw new AppError(503, "Account services are not configured. Please contact the site owner.");

// SSR 0.6 uses the SDK's older generic signature. Its runtime factory still
  // constructs a public-schema client; expose the current typed SDK contract here.
  return createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies. Middleware refreshes them;
            // actions and route handlers can persist updates normally.
          }
        }
      }
    }
  ) as SupabaseClient<Database>;
}
