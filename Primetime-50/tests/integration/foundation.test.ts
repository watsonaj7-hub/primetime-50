import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { stackConfig, testAccount } from "../local-stack";
import { validProfile } from "../fixture";

const context = vi.hoisted(() => ({ current: null as null | { supabase: SupabaseClient; user: { id: string } } }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => {
  if (!context.current) { const { AppError } = await import("@/lib/http/errors"); throw new AppError(401, "Please sign in to continue."); }
  return context.current;
} }));
import { readProfile, saveProfile } from "@/lib/services/profile";

const config = stackConfig();
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let a: Awaited<ReturnType<typeof testAccount>>;
let b: Awaited<ReturnType<typeof testAccount>>;
let planB: string;
beforeAll(async () => {
  a = await testAccount(config, admin); b = await testAccount(config, admin);
  context.current = { supabase: a.client, user: a.user };
});
afterAll(async () => { for (const account of [a,b]) if (account) await admin.auth.admin.deleteUser(account.user.id); });

describe("real database persistence and service boundary", () => {
  it("bootstraps an incomplete user profile without demo personal data", async () => {
    expect(await readProfile()).toBeNull();
    const row = await a.client.from("profiles").select("role,display_name").single();
    expect(row.data).toEqual({ role: "user", display_name: null });
  });
  it("persists profile, health and equipment atomically and reopens them", async () => {
    await saveProfile(validProfile);
    expect(await readProfile()).toMatchObject(validProfile);
    await saveProfile({ ...validProfile, display_name: "Edited profile", health_status: "limitations_reported", health_restrictions: ["knee_pain"], equipment: ["bodyweight"] });
    expect(await readProfile()).toMatchObject({ display_name: "Edited profile", health_restrictions: ["knee_pain"], equipment: ["bodyweight"] });
  });
  it("rolls back the whole RPC when equipment fails validation", async () => {
    const before = await readProfile();
    const result = await a.client.rpc("save_foundation_profile", { payload: { ...validProfile, display_name: "Must roll back", equipment: ["invalid"] } });
    expect(result.error).not.toBeNull();
    expect(await readProfile()).toEqual(before);
  });
  it("repeated saves do not duplicate current profile or equipment", async () => {
    await Promise.all([saveProfile(validProfile), saveProfile(validProfile)]);
    expect((await a.client.from("profiles").select("id")).data).toHaveLength(1);
    expect((await a.client.from("user_equipment").select("equipment_type")).data).toHaveLength(2);
  });
  it("rejects caller-owned user IDs and invalid values before storage", async () => {
    await expect(saveProfile({ ...validProfile, user_id: b.user.id })).rejects.toThrow();
    await expect(saveProfile({ ...validProfile, training_days_per_week: 10 })).rejects.toThrow();
  });
  it("refuses service access without an authenticated context", async () => {
    context.current = null;
    await expect(readProfile()).rejects.toMatchObject({ status: 401 });
    await expect(saveProfile(validProfile)).rejects.toMatchObject({ status: 401 });
    context.current = { supabase: a.client, user: a.user };
  });
});

describe("direct Supabase RLS and privileges", () => {
  it("User A cannot read, update or delete User B profile or health", async () => {
    const saved = await b.client.rpc("save_foundation_profile", { payload: validProfile });
    expect(saved.error).toBeNull();
    expect((await a.client.from("profiles").select("*").eq("user_id", b.user.id)).data).toEqual([]);
    expect((await a.client.from("health_profiles").select("*").eq("user_id", b.user.id)).data).toEqual([]);
    expect((await a.client.from("profiles").update({ display_name: "Stolen" }).eq("user_id", b.user.id).select()).data).toEqual([]);
    await a.client.from("health_profiles").delete().eq("user_id", b.user.id);
    expect((await b.client.from("health_profiles").select("*")).data).toHaveLength(1);
  });
  it("rejects cross-user insert and role escalation on insert/update", async () => {
    expect((await a.client.from("health_profiles").insert({ user_id: b.user.id, status: "none_reported" })).error).not.toBeNull();
    expect((await a.client.from("profiles").update({ role: "admin" }).eq("user_id", a.user.id)).error).not.toBeNull();
    expect((await a.client.from("profiles").insert({ user_id: a.user.id, role: "admin" })).error).not.toBeNull();
    expect((await a.client.rpc("is_admin")).data).toBe(false);
    expect((await a.client.rpc("save_foundation_profile", { payload: { ...validProfile, role: "admin" } })).error).not.toBeNull();
  });
  it("forbids anonymous private reads and mutations", async () => {
    const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
    expect((await anon.from("profiles").select("*")).error).not.toBeNull();
    expect((await anon.rpc("save_foundation_profile", { payload: validProfile })).error).not.toBeNull();
  });
  it("rejects forged foreign IDs pointing to another user's program/day/log", async () => {
    const plan = await b.client.from("workout_plans").insert({ user_id: b.user.id, plan_name: "B plan", duration_weeks: 4, goal: "strength", plan_json: {} }).select("id").single();
    expect(plan.error).toBeNull(); planB = plan.data!.id;
    expect((await a.client.from("workout_days").insert({ user_id: a.user.id, workout_plan_id: planB, workout_type: "strength" })).error).not.toBeNull();
    const day = await b.client.from("workout_days").insert({ user_id: b.user.id, workout_plan_id: planB, workout_type: "strength" }).select("id").single();
    expect(day.error).toBeNull();
    expect((await a.client.from("workout_logs").insert({ user_id: a.user.id, workout_day_id: day.data!.id })).error).not.toBeNull();
  });
  it("enforces numeric workout bounds through direct database writes", async () => {
    const log = await a.client.from("workout_logs").insert({ user_id: a.user.id }).select("id").single();
    expect(log.error).toBeNull();
    for (const change of [{ reps: 101 }, { weight: -1 }, { rpe: 11 }]) expect((await a.client.from("exercise_set_logs").insert({ user_id: a.user.id, workout_log_id: log.data!.id, set_number: 1, reps: 8, weight: 10, rpe: 6, ...change })).error).not.toBeNull();
  });
  it("keeps draft data private and removes it on profile completion", async () => {
    await a.client.from("onboarding_drafts").upsert({ user_id: a.user.id, draft_json: { step: 2 } });
    expect((await b.client.from("onboarding_drafts").select("*")).data).toEqual([]);
    expect((await b.client.from("onboarding_drafts").insert({ user_id: a.user.id, draft_json: {} })).error).not.toBeNull();
    await saveProfile(validProfile);
    expect((await a.client.from("onboarding_drafts").select("*")).data).toEqual([]);
  });
});
