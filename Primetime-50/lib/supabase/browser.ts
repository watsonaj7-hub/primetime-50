import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/lib/db/database.types";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config/public";

export function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Account services are not configured.");
// SSR 0.6 uses the SDK's older generic signature. Its runtime factory still
  // constructs a public-schema client; expose the current typed SDK contract here.
  return createBrowserClient(
    config.url,
    config.key
  ) as SupabaseClient<Database>;
}
