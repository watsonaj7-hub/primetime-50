import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
export function stackConfig() {
  let config;
  try { config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
  catch { throw new Error("Local Supabase is unavailable. Run pnpm db:start before database/browser foundation tests. No remote project or mocked database is used."); }
  if (!config.API_URL || !["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Tests require isolated local Supabase. Remote targets are refused.");
  return config as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; DB_URL: string; INBUCKET_URL?: string; MAILPIT_URL?: string };
}
export async function testAccount(config: ReturnType<typeof stackConfig>, admin: SupabaseClient) {
  const email = `foundation-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Isolated test account creation failed.");
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error("Isolated test login failed.");
  return { client, user: data.user, email, password };
}
