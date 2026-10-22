import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient as createSdkClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { stackConfig } from "../local-stack";
import { partialDraft, validProfile } from "../fixture";

// Framework request-context adapter only: Auth, SSR client, auth actions,
// callbacks, guards, handlers, services, PostgREST and RPCs are real.
// This is not browser/HTTP transport or SMTP-delivery qualification.
const context = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [...context.jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => { context.jar.set(name, value); }
}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { register, login, logout } from "@/app/actions/auth";
import { GET as callback } from "@/app/auth/callback/route";
import * as profile from "@/app/api/profile/route";
import * as draft from "@/app/api/profile/draft/route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { initialState } from "@/lib/types/mutation";

const config = stackConfig(); // Deliberately fails without the real local stack.
const admin = createSdkClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `lifecycle-${randomUUID()}@example.test`;
const password = randomBytes(24).toString("base64url");
let userId: string | undefined;
const origin = "http://localhost:3000";
function form() {
  const result = new FormData();
  for (const [key, value] of Object.entries({ email, password, confirmation: password, next: "/settings" })) result.set(key, value);
  return result;
}
function put(path: string, value: unknown) {
  return new Request(`${origin}/api/profile${path}`, { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
}
function values(saved: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(saved).filter(([key]) => !["updated_at", "onboarding_completed_at"].includes(key)));
}
beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
});
afterAll(async () => {
  try {
    // Cleanup only the unique account registered by this test, even on early failure.
    if (!userId) {
      const result = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (result.error) throw result.error;
      userId = result.data.users.find(user => user.email === email)?.id;
    }
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  } finally { context.jar.clear(); vi.unstubAllEnvs(); }
});

it("registers a real fixture, restores exact drafts/profile through renewed login, rolls back draft clear and logs out", async () => {
  expect(await register(initialState, form())).toEqual({ status: "success", message: "Check your email to confirm your account, then sign in." });
  await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  expect(await login(initialState, form())).toMatchObject({ status: "error" });
  const users = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(users.error).toBeNull();
  userId = users.data.users.find(user => user.email === email)?.id;
  expect(userId).toBeTruthy();
  // Administrative fixture confirmation, expressly NOT actual email delivery.
  expect((await admin.auth.admin.updateUserById(userId!, { email_confirm: true })).error).toBeNull();
  await expect(login(initialState, form())).rejects.toThrow("redirect:/settings");
  expect((await requireUser()).user.id).toBe(userId);
  expect(await (await profile.GET()).json()).toEqual({ profile: null });
  expect(await (await draft.GET()).json()).toEqual({ draft: null });
  expect((await draft.PUT(put("/draft", partialDraft))).status).toBe(200);
  expect(await (await draft.GET()).json()).toEqual({ draft: partialDraft });
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  expect((await profile.GET()).status).toBe(401);
  expect((await draft.PUT(put("/draft", {}))).status).toBe(401);
  await expect(login(initialState, form())).rejects.toThrow("redirect:/settings");
  expect(await (await draft.GET()).json()).toEqual({ draft: partialDraft });

  const sdk = await createClient();
  // Direct ordinary-user RPC deliberately fails after profile UPDATE fires the
  // clear-draft trigger: equipment validation is enforced by storage, not Zod.
  expect((await sdk.rpc("save_foundation_profile", { payload: { ...validProfile, equipment: ["invalid"] } })).error).not.toBeNull();
  expect(await (await profile.GET()).json()).toEqual({ profile: null });
  expect(await (await draft.GET()).json()).toEqual({ draft: partialDraft });
  const exact = { ...validProfile, unit_system: "imperial", waist_cm: 94.5, health_status: "limitations_reported", health_restrictions: ["knee_pain"], health_notes: "Fixture only" };
  const saved = await profile.PUT(put("", exact));
  expect(saved.status).toBe(200);
  const first = (await saved.json()).profile;
  expect(values(first)).toEqual(exact);
  expect(first.onboarding_completed_at).toBeTruthy();
  expect(await (await draft.GET()).json()).toEqual({ draft: null });
  // An already-started request can reach its upsert only after completion.
  // The real table guard, not an application pre-read, must reject it.
  expect((await draft.PUT(put("/draft", partialDraft))).status).toBe(409);
  expect(await (await draft.GET()).json()).toEqual({ draft: null });
  expect((await profile.PUT(put("", { ...exact, weight_kg: -1 }))).status).toBe(422);
  expect((await (await profile.GET()).json()).profile).toEqual(first);
  expect((await sdk.auth.refreshSession()).error).toBeNull();
  expect((await requireUser()).user.id).toBe(userId);
  expect((await (await profile.GET()).json()).profile).toEqual(first);
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  await expect(login(initialState, form())).rejects.toThrow("redirect:/settings");
  expect((await (await profile.GET()).json()).profile).toEqual(first);
  expect(await (await draft.GET()).json()).toEqual({ draft: null });

  // One-use provider-issued fixture link exercises the actual callback;
  // it does not request or prove delivery to a real mailbox.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  expect(link.error).toBeNull();
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  const callbackUrl = `${origin}/auth/callback?token_hash=${encodeURIComponent(link.data.properties!.hashed_token)}&type=magiclink&next=/settings`;
  expect((await callback(new Request(callbackUrl))).headers.get("location")).toBe(`${origin}/settings`);
  expect((await requireUser()).user.id).toBe(userId);
  expect((await callback(new Request(callbackUrl))).headers.get("location")).toBe(`${origin}/login?error=callback`);
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  await expect(requireUser()).rejects.toMatchObject({ status: 401 });
}, 60000);
