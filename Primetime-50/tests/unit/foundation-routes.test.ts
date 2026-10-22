import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validProfile, partialDraft as draftInput } from "../fixture";

// Only the external Supabase client is doubled. Handlers, auth, decoding,
// validation, services and error mapping are the production implementations.
const client = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), upsert: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: client.getUser }, rpc: client.rpc, from: client.from
}) }));
import * as profile from "@/app/api/profile/route";
import * as draft from "@/app/api/profile/draft/route";

function request(path: string, body: string, type = "application/json", origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/profile${path}`, {
    method: "PUT", headers: { origin, "content-type": type }, body
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  client.getUser.mockResolvedValue({ data: { user: { id: "owned-user" } }, error: null });
  client.rpc.mockResolvedValue({ error: null });
  client.upsert.mockResolvedValue({ error: null });
  client.from.mockImplementation((table: string) => ({
    upsert: client.upsert,
    select: () => ({ eq: vi.fn().mockReturnValue(table === "user_equipment"
      ? Promise.resolve({ data: validProfile.equipment.map(equipment_type => ({ equipment_type })), error: null })
      : { maybeSingle: async () => ({ data: table === "profiles"
        ? { ...Object.fromEntries(Object.entries(validProfile).filter(([key]) => !["health_status", "health_restrictions", "health_notes", "equipment"].includes(key))), updated_at: "now", onboarding_completed_at: "now" }
        : { status: validProfile.health_status, restrictions: [], notes: "" }, error: null }) }) })
  }));
});
afterEach(() => vi.unstubAllEnvs());

it("reports a completed-onboarding draft rejection without claiming it was saved", async () => {
  client.upsert.mockResolvedValue({ error: { code: "55000", message: "private-provider-detail" } });
  const response = await draft.PUT(request("/draft", JSON.stringify(draftInput)));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "Your profile is already complete. This draft was not saved. Use Settings to make changes."
  });
});

describe.each([["profile", "", profile], ["draft", "/draft", draft]] as const)("%s public mutation boundary", (_name, path, handler) => {
  it.each([
    ["malformed", "{", "application/json"],
    ["oversized", JSON.stringify("x".repeat(17000)), "application/json"],
    ["wrong media type", "{}", "text/plain"],
    ["invalid schema", "{}", "application/json"]
  ])("rejects anonymous %s before consuming the body", async (_label, body, type) => {
    client.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = request(path, body, type);
    const response = await handler.PUT(req);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Please sign in to continue." });
    expect(req.bodyUsed).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before authentication or body consumption", async () => {
    const req = request(path, "{", "application/json", "https://evil.example");
    expect((await handler.PUT(req)).status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect(client.getUser).not.toHaveBeenCalled();
  });
  it.each([["{", "application/json", 400], [JSON.stringify("x".repeat(17000)), "application/json", 413], ["{}", "text/plain", 415], ["{}", "application/json", 422]])(
    "preserves authenticated decoding/validation errors (%i)", async (body, type, status) => {
      expect((await handler.PUT(request(path, body, type))).status).toBe(status);
      expect(client.rpc).not.toHaveBeenCalled();
      expect(client.from).not.toHaveBeenCalled();
    });
  it("returns actionable save failure without exposing provider details", async () => {
    client.rpc.mockResolvedValue({ error: { message: "private-provider-detail" } });
    client.upsert.mockResolvedValue({ error: { message: "private-provider-detail" } });
    const response = await handler.PUT(request(path, JSON.stringify(path ? draftInput : validProfile)));
    expect(response.status).toBe(503);
    const result = await response.text();
    expect(result).toContain("not saved");
    expect(result).not.toContain("private-provider-detail");
  });
  it("saves valid input through the owned production service", async () => {
    const response = await handler.PUT(request(path, JSON.stringify(path ? draftInput : validProfile)));
    expect(response.status).toBe(200);
    if (path) {
      expect(client.upsert).toHaveBeenCalledWith({ user_id: "owned-user", draft_json: draftInput });
      expect(await response.json()).toEqual({ saved: true });
    } else {
      expect(client.rpc).toHaveBeenCalledWith("save_foundation_profile", { payload: validProfile });
      expect(await response.json()).toEqual({ profile: { ...validProfile, updated_at: "now", onboarding_completed_at: "now" } });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
