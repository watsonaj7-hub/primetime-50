// Boundary unit tests: real routes/services; Supabase/auth are mocks, not persistence proof.
import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: boundary.auth }));
const id = "10000000-0000-4000-8000-000000000001";
const entry = { id: "20000000-0000-4000-8000-000000000001", exercise_key: "30000000-0000-4000-8000-000000000001", exercise_name: "User-entered activity", set_number: 1, reps: 8, weight: 12.5, rpe: 7 };
const record = { id, revision: 1, completed: false, completed_at: null, exercise_set_logs: [] };
beforeEach(() => {
  vi.resetAllMocks();
  boundary.auth.mockResolvedValue({ supabase: { rpc: boundary.rpc, from: boundary.from }, user: { id: "owner" } });
  boundary.rpc.mockResolvedValue({ data: record, error: null });
});
// Dynamic import makes the first test assert the missing production endpoint explicitly.
async function routes() { return import("@/app/api/workouts/route").catch(() => null); }
async function request(method: string, body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/workouts", { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
it("exposes the owned recording API", async () => { expect(await routes(), "workout recording endpoint must exist").not.toBeNull(); });
it("authenticates before parsing mutation fields or touching storage", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const { AppError } = await import("@/lib/http/errors");
  boundary.auth.mockRejectedValue(new AppError(401, "Please sign in to continue."));
  expect((await api!.PUT(await request("PUT", { user_id: "forged" }))).status).toBe(401);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it("starts explicit personal recording and rejects caller provenance", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const input = { id, mode: "personal", timezone: "Australia/Melbourne" };
  const response = await api!.POST(await request("POST", input));
  expect(response.status).toBe(200);
  expect(boundary.rpc).toHaveBeenCalledWith("start_workout_record", { payload: input });
  expect((await api!.POST(await request("POST", { ...input, snapshot: { approved: true } }))).status).toBe(422);
});
it("returns safe unavailable for reviewed start without calling storage", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const response = await api!.POST(await request("POST", { id, mode: "reviewed", timezone: "UTC" }));
  expect(response.status).toBe(409); expect(await response.text()).toContain("reviewed");
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it.each([{ reps: 101 }, { reps: 1.5 }, { weight: -1 }, { weight: "10" }, { rpe: 11 }, { set_number: 21 }, { user_id: "forged" }, { workout_exercise_id: id }])("rejects invalid/forged set fields %j", async change => {
  const api = await routes(); expect(api).not.toBeNull();
  expect((await api!.PUT(await request("PUT", { id, expected_revision: 0, sets: [{ ...entry, ...change }] }))).status).toBe(422);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it("sends distinct sets as one save batch, including explicit draft nulls", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const payload = { id, expected_revision: 0, sets: [entry, { ...entry, id: "20000000-0000-4000-8000-000000000002", set_number: 2, reps: null, weight: null, rpe: null }] };
  expect((await api!.PUT(await request("PUT", payload))).status).toBe(200);
  expect(boundary.rpc).toHaveBeenCalledWith("save_workout_record", { payload });
});
it("rejects duplicate set IDs and slots before storage", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  expect((await api!.PUT(await request("PUT", { id, expected_revision: 0, sets: [entry, entry] }))).status).toBe(422);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it("reports failed saves and revision conflicts without success", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  boundary.rpc.mockResolvedValueOnce({ error: { code: "40001", message: "private" } });
  expect((await api!.PUT(await request("PUT", { id, expected_revision: 0, sets: [entry] }))).status).toBe(409);
  boundary.rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "private database details" } });
  const response = await api!.PUT(await request("PUT", { id, expected_revision: 0, sets: [entry] }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
});
it("uses separate completion with an acknowledged revision and stable database result", async () => {
  const api = await import("@/app/api/workouts/complete/route").catch(() => null); expect(api).not.toBeNull();
  const completed = { ...record, completed: true, completed_at: "2026-10-22T04:00:00Z" };
  boundary.rpc.mockResolvedValue({ data: completed, error: null });
  const payload = { id, expected_revision: 1 };
  for (let i = 0; i < 2; i++) expect(await (await api!.POST(await request("POST", payload))).json()).toEqual({ workout: completed });
  expect(boundary.rpc).toHaveBeenCalledWith("complete_workout_record", { payload });
});
it("refuses cross-origin writes before auth or storage", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  expect((await api!.POST(await request("POST", {}, "https://evil.example"))).status).toBe(403);
  expect(boundary.auth).not.toHaveBeenCalled(); expect(boundary.rpc).not.toHaveBeenCalled();
});
it("reads with explicit authenticated owner and stable ordering, with no cache", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [record], error: null }) };
  boundary.from.mockReturnValue(query);
  const response = await api!.GET(new Request(`http://localhost/api/workouts?id=${id}`));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(query.eq).toHaveBeenCalledWith("user_id", "owner"); expect(query.eq).toHaveBeenCalledWith("id", id);
});
it("authenticates malformed JSON requests before reporting payload details", async () => {
  const api = await routes(); expect(api).not.toBeNull();
  const { AppError } = await import("@/lib/http/errors");
  boundary.auth.mockRejectedValue(new AppError(401, "Please sign in to continue."));
  const malformed = new Request("http://localhost/api/workouts", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
  expect((await api!.POST(malformed)).status).toBe(401);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
