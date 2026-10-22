import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { partialDraft, validProfile } from "../fixture";

// External boundary only. These tests qualify production auth/route/DAL wiring,
// not RLS, cookies, real sessions or database persistence.
const state = vi.hoisted(() => ({
  id: "user-a", getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), upsert: vi.fn(), eq: vi.fn(),
  providerError: false
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: state.getUser }, from: state.from, rpc: state.rpc
}) }));
import * as profile from "@/app/api/profile/route";
import * as draft from "@/app/api/profile/draft/route";

const origin = "http://localhost:3000";
const privateValue = "SYNTHETIC_ISSUE4_PROVIDER_ERROR_NOT_A_CREDENTIAL";
function put(value: unknown, headers: Record<string, string> = { origin }) {
  return new Request(`${origin}/api/profile`, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}
beforeEach(() => {
  vi.resetAllMocks();
  state.id = "user-a"; state.providerError = false;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  state.getUser.mockImplementation(async () => ({ data: { user: { id: state.id, user_metadata: { user_id: "user-b", role: "admin" } } }, error: null }));
  state.rpc.mockResolvedValue({ error: null });
  state.upsert.mockResolvedValue({ error: null });
  state.from.mockImplementation((table: string) => ({
    upsert: state.upsert,
    select: () => ({ eq: (key: string, id: string) => {
      state.eq(table, key, id);
      const result = { error: state.providerError ? { message: privateValue } : null, data:
        table === "user_equipment" ? validProfile.equipment.map(equipment_type => ({ equipment_type })) :
        table === "onboarding_drafts" ? { draft_json: partialDraft } :
        table === "health_profiles" ? { status: "none_reported", restrictions: [], notes: "" } :
        { ...Object.fromEntries(Object.entries(validProfile).filter(([key]) => !["equipment", "health_status", "health_restrictions", "health_notes"].includes(key))), display_name: id, updated_at: "now", onboarding_completed_at: "now" }
      };
      return table === "user_equipment" ? Promise.resolve(result) : { maybeSingle: async () => result };
    } })
  }));
});
afterEach(() => vi.unstubAllEnvs());

it("binds every private read and draft write to verified A then B, ignoring metadata", async () => {
  for (const id of ["user-a", "user-b"]) {
    state.id = id; state.eq.mockClear();
    const response = await profile.GET();
    expect(response.status).toBe(200);
    expect((await response.json()).profile.display_name).toBe(id);
    expect((await draft.GET()).status).toBe(200);
    expect(state.eq.mock.calls).toEqual([
      ["profiles", "user_id", id], ["health_profiles", "user_id", id],
      ["user_equipment", "user_id", id], ["onboarding_drafts", "user_id", id]
    ]);
    expect((await draft.PUT(put(partialDraft))).status).toBe(200);
    expect(state.upsert).toHaveBeenLastCalledWith({ user_id: id, draft_json: partialDraft });
  }
});

describe.each([["profile", profile, validProfile], ["draft", draft, partialDraft]] as const)("%s ownership boundary", (_name, handler, input) => {
  it.each([{ user_id: "user-b" }, { role: "admin" }, { user_id: null }, { role: null }])("rejects caller ownership/authority fields %j before effects", async change => {
    expect((await handler.PUT(put({ ...input, ...change }))).status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled();
  });
  it("rejects a missing origin before auth, body reads or effects", async () => {
    const request = put(input, {});
    expect((await handler.PUT(request)).status).toBe(403);
    expect(request.bodyUsed).toBe(false); expect(state.getUser).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled();
  });
  it("rejects anonymous reads and suppresses upstream private read errors", async () => {
    state.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await handler.GET()).status).toBe(401);
    expect(state.from).not.toHaveBeenCalled();
    state.providerError = true;
    const response = await handler.GET();
    expect(response.status).toBe(503);
    expect((await response.text()).includes(privateValue)).toBe(false);
  });
});

const bounds = [
  ["height_cm", 100, 250], ["weight_kg", 25, 350], ["waist_cm", 30, 250],
  ["training_days_per_week", 1, 7], ["preferred_session_minutes", 10, 120]
] as const;
describe.each(bounds)("profile numeric boundary %s", (field, min, max) => {
  it.each([min - 1, max + 1, "1", ...(field === "waist_cm" ? [] : [null])])("rejects invalid %s before the storage RPC", async value => {
    expect((await profile.PUT(put({ ...validProfile, [field]: value }))).status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled();
  });
  it.each([min, max])("accepts exact boundary %s through the production RPC", async value => {
    expect((await profile.PUT(put({ ...validProfile, [field]: value }))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("save_foundation_profile", { payload: { ...validProfile, [field]: value } });
  });
});
it.each(["training_days_per_week", "preferred_session_minutes"])("rejects fractional %s before effects", async field => {
  expect((await profile.PUT(put({ ...validProfile, [field]: field === "training_days_per_week" ? 3.5 : 45.5 }))).status).toBe(422);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("allows a null optional waist without inventing a measurement", async () => {
  expect((await profile.PUT(put(validProfile))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("save_foundation_profile", { payload: validProfile });
});
