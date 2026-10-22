// Real production handlers/services, doubled identity/database boundary. No SQL acceptance claim.
import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: boundary.auth }));
import { GET, POST, PUT } from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
import { AppError } from "@/lib/http/errors";
const id = "61000000-0000-4000-8000-000000000001", version = "61000000-0000-4000-8000-000000000002";
const start = { id, mode: "reviewed", timezone: "UTC", catalogue_version_id: version };
const snapshot = { source: "reviewed_catalogue", content_id: "SYNTHETIC_TEST_ONLY", content_version: "fixture-v1", rule_version: "fixture-r1", reviewer_name: "SYNTHETIC_NOT_A_REAL_REVIEWER", prescription: { title: "TEST DATA ONLY" } };
function req(body: unknown, method = "POST") { return new Request("http://localhost/api/workouts", { method, headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.resetAllMocks(); boundary.auth.mockResolvedValue({ supabase: { rpc: boundary.rpc, from: boundary.from }, user: { id: "verified-owner" } });
  boundary.rpc.mockResolvedValue({ data: { id, record_mode: "reviewed", prescription_snapshot: snapshot }, error: null });
});
it("resolves availability at the authenticated storage boundary without accepting client eligibility", async () => {
  const data = { state: "available", workouts: [{ catalogue_version_id: version, prescription_snapshot: snapshot }] };
  boundary.rpc.mockResolvedValue({ data, error: null });
  const result = await GET(new Request("http://localhost/api/workouts?view=reviewed-availability"));
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ availability: data });
  expect(boundary.rpc).toHaveBeenCalledWith("reviewed_workout_availability", {});
  expect(boundary.from).not.toHaveBeenCalled();
});
it.each(["unavailable", "unsupported", "referral_required"])("preserves safe storage state %s with no substitute", async state => {
  boundary.rpc.mockResolvedValue({ data: { state, workouts: [] }, error: null });
  const result = await GET(new Request("http://localhost/api/workouts?view=reviewed-availability"));
  expect(await result.json()).toEqual({ availability: { state, workouts: [] } });
});
it("starts the exact reviewed version through atomic SQL admission and returns its trusted snapshot", async () => {
  const result = await POST(req(start));
  expect(result.status).toBe(200); expect(boundary.rpc).toHaveBeenCalledWith("start_workout_record", { payload: start });
  expect((await result.json()).workout.prescription_snapshot).toEqual(snapshot);
});
it.each([{ snapshot }, { eligibility: true }, { approved: true }, { user_id: "other" }, { profile: {} }, { catalogue_version_id: "invalid" }])("rejects forged or malformed admission data %j before storage", async change => {
  expect((await POST(req({ ...start, ...change }))).status).toBe(422); expect(boundary.rpc).not.toHaveBeenCalled();
});
it("checks authentication before malformed body or availability storage", async () => {
  boundary.auth.mockRejectedValue(new AppError(401, "Please sign in to continue."));
  const malformed = new Request("http://localhost/api/workouts", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
  expect((await POST(malformed)).status).toBe(401); expect(malformed.bodyUsed).toBe(false);
  expect((await GET(new Request("http://localhost/api/workouts?view=reviewed-availability"))).status).toBe(401);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it("maps reviewed unavailability without echoing trusted data and without retrying", async () => {
  boundary.rpc.mockResolvedValue({ error: { code: "P5501", message: "private catalogue details" } });
  const result = await POST(req(start)); expect(result.status).toBe(409); expect(await result.text()).not.toContain("private");
  expect(boundary.rpc).toHaveBeenCalledTimes(1);
});
it("reads both managed modes with owned filtering and returns the original snapshot", async () => {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id, record_mode: "reviewed", prescription_snapshot: snapshot, exercise_set_logs: [] }], error: null }) };
  boundary.from.mockReturnValue(q);
  const result = await GET(new Request(`http://localhost/api/workouts?id=${id}`));
  expect(result.status).toBe(200); expect((await result.json()).workouts[0].prescription_snapshot).toEqual(snapshot);
  expect(q.eq).toHaveBeenCalledWith("user_id", "verified-owner"); expect(q.in).toHaveBeenCalledWith("record_mode", ["personal", "reviewed"]);
});
it("keeps save and complete wired to the shared owned SQL lifecycle", async () => {
  const entry = { id: version, exercise_key: version, exercise_name: "TEST ONLY", set_number: 1, reps: 1, weight: 0, rpe: 1 };
  expect((await PUT(req({ id, expected_revision: 0, sets: [entry] }, "PUT"))).status).toBe(200);
  expect((await complete(req({ id, expected_revision: 1 }))).status).toBe(200);
  expect(boundary.rpc.mock.calls.map(x => x[0])).toEqual(["save_workout_record", "complete_workout_record"]);
});
it("the installed Supabase adapter does not retry admission POSTs, even for historical 40001 mapped to HTTP 503", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  let calls = 0;
  const client = createClient("https://example.test", "public-synthetic-fixture", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (_url, init) => {
    calls++; expect(init?.method).toBe("POST");
    return new Response(JSON.stringify({ code: "40001", message: "synthetic conflict", details: null, hint: null }), { status: 503, headers: { "content-type": "application/json" } });
  } } });
  const result = await client.rpc("start_workout_record", { payload: start });
  expect(result.error?.code).toBe("40001"); expect(calls).toBe(1);
});
