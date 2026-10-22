// Production route/service; only external auth/storage are doubled. NOT connected acceptance.
import { beforeEach, expect, it, vi } from "vitest";
const b = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: b.auth }));
import { GET } from "@/app/api/workouts/route";
import { AppError } from "@/lib/http/errors";
beforeEach(() => vi.resetAllMocks());
it("filters completed owned history before the bounded read, retaining personal and reviewed modes", async () => {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
  b.auth.mockResolvedValue({ user: { id: "owner-A" }, supabase: { from: b.from } }); b.from.mockReturnValue(q);
  const response = await GET(new Request("http://localhost/api/workouts?view=history"));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(q.eq.mock.calls).toContainEqual(["user_id", "owner-A"]);
  expect(q.eq.mock.calls).toContainEqual(["completed", true]);
  expect(q.in).toHaveBeenCalledWith("record_mode", ["personal", "reviewed"]);
  expect(q.order.mock.calls).toEqual([["performed_at", { ascending: false }], ["id", { ascending: false }]]);
  expect(q.limit).toHaveBeenCalledWith(100);
});
it("authenticates history before validating IDs or reading storage", async () => {
 b.auth.mockRejectedValue(new AppError(401,"Sign in"));
 expect((await GET(new Request("http://localhost/api/workouts?view=history&id=invalid"))).status).toBe(401);
 expect(b.from).not.toHaveBeenCalled();
});
