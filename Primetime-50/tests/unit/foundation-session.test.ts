import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
const boundary = vi.hoisted(() => ({ factory: vi.fn(), cookies: { getAll: vi.fn(), set: vi.fn() } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: boundary.factory }));
vi.mock("next/headers", () => ({ cookies: async () => boundary.cookies }));
import { middleware } from "@/middleware";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

type CookieAdapter = { cookies: { getAll: () => unknown; setAll: (values: { name: string; value: string; options: CookieOptions }[]) => void } };
const getUser = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-unit-fixture");
  boundary.factory.mockReturnValue({ auth: { getUser } });
  boundary.cookies.getAll.mockReturnValue([{ name: "session-fixture", value: "old-fixture" }]);
});
afterEach(() => vi.unstubAllEnvs());
it("uses verified getUser and rejects missing or provider-rejected users", async () => {
  getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: "fixture" } }, error: {} })
    .mockResolvedValueOnce({ data: { user: { id: "fixture" } }, error: null });
  await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  expect((await requireUser()).user.id).toBe("fixture");
});
it("persists SDK cookie changes through the production server adapter", async () => {
  await createClient();
  const adapter = boundary.factory.mock.calls[0][2] as CookieAdapter;
  expect(adapter.cookies.getAll()).toEqual([{ name: "session-fixture", value: "old-fixture" }]);
  adapter.cookies.setAll([{ name: "session-fixture", value: "renewed-fixture", options: { httpOnly: true } }]);
  expect(boundary.cookies.set).toHaveBeenCalledWith("session-fixture", "renewed-fixture", { httpOnly: true });
});
it("fails closed when account services are unconfigured", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  await expect(requireUser()).rejects.toMatchObject({ status: 503 });
  const response = await middleware(new NextRequest("http://localhost:3000/settings"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fsettings");
  expect(boundary.factory).not.toHaveBeenCalled();
});
it.each([true, false])("forwards refreshed cookies to the request and response (verified=%s)", async verified => {
  const request = new NextRequest("http://localhost:3000/settings");
  boundary.factory.mockImplementation((_url: string, _key: string, adapter: CookieAdapter) => ({
    auth: { getUser: async () => {
      adapter.cookies.setAll([{ name: "session-fixture", value: "renewed-fixture", options: { path: "/", httpOnly: true } }]);
      return { data: { user: verified ? { id: "fixture" } : null }, error: null };
    } }
  }));
  const response = await middleware(request);
  expect(request.cookies.get("session-fixture")?.value).toBe("renewed-fixture");
  expect(response.cookies.get("session-fixture")?.value).toBe("renewed-fixture");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.status).toBe(verified ? 200 : 307);
});
it("redirects protected navigation when the provider throws", async () => {
  getUser.mockRejectedValue(new Error("private-provider-detail"));
  const response = await middleware(new NextRequest("http://localhost:3000/onboarding"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fonboarding");
});

it.each(["user", null])("ignores client metadata admin claims when stored role is %s", async role => {
  getUser.mockResolvedValue({ data: { user: { id: "user-a", user_metadata: { role: "admin" }, app_metadata: { role: "admin" } } }, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) });
  const select = vi.fn().mockReturnValue({ eq });
  boundary.factory.mockReturnValue({ auth: { getUser }, from: vi.fn().mockReturnValue({ select }) });
  const response = await middleware(new NextRequest("http://localhost:3000/admin"));
  expect(response.status).toBe(403);
  expect(eq).toHaveBeenCalledWith("user_id", "user-a");
  expect(select).toHaveBeenCalledWith("role");
});
it("admits an administrator only through the stored own profile role", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "admin-fixture", user_metadata: { role: "user" } } }, error: null });
  boundary.factory.mockReturnValue({ auth: { getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "admin" }, error: null }) }) }) }) });
  expect((await middleware(new NextRequest("http://localhost:3000/admin"))).status).toBe(200);
});
