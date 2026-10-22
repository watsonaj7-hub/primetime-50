import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), signInWithOtp: vi.fn(),
  signOut: vi.fn(), exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { login, logout, register } from "@/app/actions/auth";
import { GET } from "@/app/auth/callback/route";
import { initialState } from "@/lib/types/mutation";
function form(change: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ email: "member@example.test", password: "isolated-test-password", confirmation: "isolated-test-password", next: "/settings", ...change }).forEach(([k,v]) => data.set(k,v));
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
});
afterEach(() => vi.unstubAllEnvs());
it("requires matching valid registration details without calling the provider", async () => {
  expect(await register(initialState, form({ confirmation: "different" }))).toMatchObject({ status: "error", fields: { confirmation: expect.any(Array) } });
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("reports confirmation required rather than claiming a session", async () => {
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  expect(await register(initialState, form())).toEqual({ status: "success", message: "Check your email to confirm your account, then sign in." });
  expect(auth.signUp).toHaveBeenCalledWith({ email: "member@example.test", password: "isolated-test-password", options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=/onboarding" } });
});
it("redirects an already authenticated registration", async () => {
  auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
  await expect(register(initialState, form())).rejects.toThrow("redirect:/onboarding");
});
it("does not expose registration provider failures", async () => {
  auth.signUp.mockResolvedValue({ data: {}, error: { message: "private-provider-detail" } });
  expect(await register(initialState, form())).toMatchObject({ status: "error" });
  expect(JSON.stringify(await register(initialState, form()))).not.toContain("private-provider-detail");
});
it("returns actionable password login failure and preserves caller form data", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: {} });
  const data = form();
  expect(await login(initialState, data)).toMatchObject({ status: "error", message: expect.stringContaining("email confirmation") });
  expect(data.get("email")).toBe("member@example.test");
  expect(data.get("password")).toBe("isolated-test-password");
});
it("returns password users only to allowlisted destinations", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: null });
  await expect(login(initialState, form())).rejects.toThrow("redirect:/settings");
  await expect(login(initialState, form({ next: "//evil.example" }))).rejects.toThrow("redirect:/onboarding");
});
it("requests a returning-user magic link without creating an account", async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  expect(await login(initialState, form({ intent: "magic_link" }))).toMatchObject({ status: "success" });
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "member@example.test", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fsettings" } });
});
it.each([[429, "Too many requests"], [503, "Email delivery is unavailable"]])("reports magic-link failure %i", async (status, message) => {
  auth.signInWithOtp.mockResolvedValue({ error: { status } });
  expect(await login(initialState, form({ intent: "magic_link" }))).toMatchObject({ status: "error", message: expect.stringContaining(message) });
});
it("only redirects after successful local logout", async () => {
  auth.signOut.mockResolvedValueOnce({ error: {} }).mockResolvedValueOnce({ error: null });
  expect(await logout(initialState)).toMatchObject({ status: "error" });
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
});
it("exchanges a provider code then uses the trusted app origin", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  const response = await GET(new Request("http://untrusted.example/auth/callback?code=fixture-code&next=/settings"));
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("fixture-code");
  expect(response.headers.get("location")).toBe("http://localhost:3000/settings");
});
it.each(["signup", "magiclink", "email"])("verifies the supported %s token callback", async type => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(new Request(`http://localhost:3000/auth/callback?token_hash=fixture-hash&type=${type}&next=//evil.example`));
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "fixture-hash", type });
  expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
});
it.each(["", "?token_hash=fixture-hash&type=recovery", "?code=bad-code"])("fails callbacks closed without echoing auth material: %s", async query => {
  auth.exchangeCodeForSession.mockRejectedValue(new Error("private-provider-detail"));
  const response = await GET(new Request(`http://localhost:3000/auth/callback${query}`));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=callback");
  expect(await response.text()).not.toContain("private-provider-detail");
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
