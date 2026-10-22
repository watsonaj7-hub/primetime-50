import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
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
let draftAccount: Awaited<ReturnType<typeof testAccount>>;
beforeAll(async () => {
  a = await testAccount(config, admin); b = await testAccount(config, admin);
  context.current = { supabase: a.client, user: a.user };
});
afterAll(async () => { for (const account of [a,b,draftAccount]) if (account) await admin.auth.admin.deleteUser(account.user.id); });

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
  it("enforces managed workout numeric bounds through the supported owned RPC without partial writes", async () => {
    const id = randomUUID();
    const started = await a.client.rpc("start_workout_record", { payload: { id, mode: "personal", timezone: "UTC" } });
    expect(started.error).toBeNull();
    expect(started.data).toMatchObject({ id, revision: 0, completed: false });
    const valid = { id: randomUUID(), exercise_key: randomUUID(), exercise_name: "Synthetic numeric fixture; no prescription", set_number: 1, reps: 8, weight: 10, rpe: 6 };
    const saved = await a.client.rpc("save_workout_record", { payload: { id, expected_revision: 0, sets: [valid] } });
    expect(saved.error).toBeNull(); expect(saved.data).toMatchObject({ id, revision: 1, completed: false });
    const before = await a.client.from("exercise_set_logs").select("*").eq("workout_log_id", id).single();
    expect(before.error).toBeNull(); expect(before.data).toMatchObject(valid);
    for (const change of [{ set_number: 0 }, { set_number: 21 }, { reps: -1 }, { reps: 101 }, { weight: -1 }, { weight: "NaN" }, { weight: "Infinity" }, { rpe: 0 }, { rpe: 11 }]) {
      // Valid first entry must be rolled back when the second entry fails SQL validation.
      const invalid = { ...valid, id: randomUUID(), set_number: 2, ...change };
      const result = await a.client.rpc("save_workout_record", { payload: { id, expected_revision: 1, sets: [{ ...valid, reps: 9 }, invalid] } });
      expect(result.error?.code).toBe("22023");
      const after = await a.client.from("exercise_set_logs").select("*").eq("workout_log_id", id).single();
      expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
      const log = await a.client.from("workout_logs").select("revision,completed,completed_at").eq("id", id).single();
      expect(log.error).toBeNull(); expect(log.data).toEqual({ revision: 1, completed: false, completed_at: null });
    }
    // A valid direct insert must be denied by managed-parent RLS, not confused with CHECK failure.
    const forgedId = randomUUID();
    expect((await a.client.from("workout_logs").insert({ id: forgedId, user_id: a.user.id, record_mode: "personal", record_timezone: "UTC", prescription_snapshot: { source: "user_recorded", version: 1, prescription: null, weight_unit: "kg" } })).error?.code).toBe("42501");
    const absent = await a.client.from("workout_logs").select("id").eq("id", forgedId);
    expect(absent.error).toBeNull(); expect(absent.data).toEqual([]);
    const direct = { user_id: a.user.id, workout_log_id: id, set_number: 2, reps: 8, weight: 10, rpe: 6 };
    expect((await a.client.from("exercise_set_logs").insert(direct)).error?.code).toBe("42501");
    for (const action of [
      a.client.from("exercise_set_logs").update({ reps: 99 }).eq("id", valid.id).select(),
      a.client.from("exercise_set_logs").delete().eq("id", valid.id).select(),
      a.client.from("workout_logs").update({ completed: true }).eq("id", id).select(),
      a.client.from("workout_logs").delete().eq("id", id).select()
    ]) {
      const denied = await action;
      expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    }
    const after = await a.client.from("exercise_set_logs").select("*").eq("workout_log_id", id).single();
    expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
    const log = await a.client.from("workout_logs").select("revision,completed,completed_at").eq("id", id).single();
    expect(log.error).toBeNull(); expect(log.data).toEqual({ revision: 1, completed: false, completed_at: null });
  });
  it("retains exact legacy SQL CHECK numeric coverage separately from managed RLS", async () => {
    // Preserve the working legacy owner-write contract (NULL record_mode).
    // This positive control grants no direct-write permission to managed personal records.
    const log = await a.client.from("workout_logs").insert({ user_id: a.user.id }).select("id").single();
    expect(log.error).toBeNull();
    const valid = { user_id: a.user.id, workout_log_id: log.data!.id, set_number: 1, reps: 8, weight: 10, rpe: 6 };
    expect((await a.client.from("exercise_set_logs").insert(valid)).error).toBeNull();
    const before = await a.client.from("exercise_set_logs").select("*").eq("workout_log_id", log.data!.id);
    expect(before.error).toBeNull(); expect(before.data).toHaveLength(1);
    for (const change of [{ set_number: 0 }, { set_number: 21 }, { reps: -1 }, { reps: 101 }, { weight: -1 }, { weight: "NaN" }, { weight: "Infinity" }, { rpe: 0 }, { rpe: 11 }]) {
      expect((await a.client.from("exercise_set_logs").insert({ ...valid, ...change })).error?.code).toBe("23514");
    }
    const after = await a.client.from("exercise_set_logs").select("*").eq("workout_log_id", log.data!.id);
    expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
  });
  it("enforces both sides of profile numeric bounds on direct authenticated writes", async () => {
    const before = await a.client.from("profiles").select("*").eq("user_id", a.user.id).single();
    expect(before.error).toBeNull();
    for (const change of [
      { height_cm: 99 }, { height_cm: 251 }, { weight_kg: 24 }, { weight_kg: 351 },
      { waist_cm: 29 }, { waist_cm: 251 }, { training_days_per_week: 0 },
      { training_days_per_week: 8 }, { preferred_session_minutes: 9 }, { preferred_session_minutes: 121 }
    ]) {
      expect((await a.client.from("profiles").update(change).eq("user_id", a.user.id)).error?.code).toBe("23514");
    }
    const after = await a.client.from("profiles").select("*").eq("user_id", a.user.id).single();
    expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
  });
  it("keeps a genuinely incomplete account's draft private and removes it on completion", async () => {
    draftAccount = await testAccount(config, admin);
    const owner = draftAccount.client;
    const saved = await owner.from("onboarding_drafts").upsert({ user_id: draftAccount.user.id, draft_json: { step: 2 } });
    expect(saved.error).toBeNull();
    const own = await owner.from("onboarding_drafts").select("draft_json").single();
    expect(own.error).toBeNull(); expect(own.data).toEqual({ draft_json: { step: 2 } });
    const hidden = await b.client.from("onboarding_drafts").select("*").eq("user_id", draftAccount.user.id);
    expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
    const changed = await b.client.from("onboarding_drafts").update({ draft_json: {} }).eq("user_id", draftAccount.user.id).select();
    expect(changed.error).toBeNull(); expect(changed.data).toEqual([]);
    expect((await b.client.from("onboarding_drafts").insert({ user_id: draftAccount.user.id, draft_json: {} })).error?.code).toBe("42501");
    const removed = await b.client.from("onboarding_drafts").delete().eq("user_id", draftAccount.user.id).select();
    expect(removed.error).toBeNull(); expect(removed.data).toEqual([]);
    expect((await owner.from("onboarding_drafts").select("draft_json").single()).data).toEqual(own.data);
    expect((await owner.rpc("save_foundation_profile", { payload: validProfile })).error).toBeNull();
    const cleared = await owner.from("onboarding_drafts").select("*");
    expect(cleared.error).toBeNull(); expect(cleared.data).toEqual([]);
    expect((await owner.from("onboarding_drafts").upsert({ user_id: draftAccount.user.id, draft_json: { step: 3 } })).error?.code).toBe("55000");
  });
  it("ignores user-editable Auth metadata when determining administrator authority", async () => {
    expect((await a.client.auth.updateUser({ data: { role: "admin", user_id: b.user.id } })).error).toBeNull();
    const authority = await a.client.rpc("is_admin");
    expect(authority.error).toBeNull(); expect(authority.data).toBe(false);
    const own = await a.client.from("profiles").select("role").eq("user_id", a.user.id).single();
    expect(own.error).toBeNull(); expect(own.data).toEqual({ role: "user" });
  });
  it("protects equipment reads and mutations without changing the owner's values", async () => {
    const before = await b.client.from("user_equipment").select("*");
    expect(before.error).toBeNull(); expect(before.data!.length).toBeGreaterThan(0);
    for (const action of [
      a.client.from("user_equipment").select("*"),
      a.client.from("user_equipment").update({ equipment_type: "chair" }).select(),
      a.client.from("user_equipment").delete().select()
    ]) {
      const result = await action.eq("user_id", b.user.id);
      expect(result.error).toBeNull(); expect(result.data).toEqual([]);
    }
    expect((await a.client.from("user_equipment").insert({ user_id: b.user.id, equipment_type: "chair" })).error?.code).toBe("42501");
    const after = await b.client.from("user_equipment").select("*");
    expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
  });
});
