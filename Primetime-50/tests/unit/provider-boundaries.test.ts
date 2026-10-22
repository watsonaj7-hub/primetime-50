import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateNames } from "../security/browser-secrets";
const boundary = vi.hoisted(() => ({ getUser: vi.fn(), ai: vi.fn(), checkout: vi.fn(), openai: vi.fn(), stripe: vi.fn(), signature: vi.fn(), constructEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: boundary.getUser } }) }));
vi.mock("openai", () => ({ default: boundary.openai }));
vi.mock("stripe", () => ({ default: boundary.stripe }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: boundary.signature }) }));
import * as ai from "@/app/api/ai/plan/route";
import * as checkout from "@/app/api/stripe/checkout/route";
import * as webhook from "@/app/api/stripe/webhook/route";
const origin = "http://localhost:3000";
const privateValues = privateNames.map((_, index) => `SYNTHETIC_PROVIDER_VALUE_${index}_NOT_CREDENTIAL`);
function request(body: string, originValue: string | null = origin) {
  return new Request(`${origin}/api/fixture`, { method: "POST", headers: { "content-type": "application/json", ...(originValue ? { origin: originValue } : {}) }, body });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  privateNames.forEach((name, index) => vi.stubEnv(name, privateValues[index]));
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_synthetic_fixture");
  boundary.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
  boundary.openai.mockImplementation(function () { return { chat: { completions: { create: boundary.ai } } }; });
  boundary.stripe.mockImplementation(function () { return { checkout: { sessions: { create: boundary.checkout } }, webhooks: { constructEvent: boundary.constructEvent } }; });
  boundary.ai.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ fixture: true }) } }] });
  boundary.checkout.mockResolvedValue({ url: "https://checkout.example.test/fixture" });
});
afterEach(() => vi.unstubAllEnvs());
async function expectPrivateFree(response: Response) {
  const body = await response.text();
  // Boolean assertions never send a response or configured value to the reporter.
  expect(privateValues.some(value => body.includes(value))).toBe(false);
  expect(privateNames.some(name => body.includes(name))).toBe(false);
}
describe.each([["AI", ai, {}], ["checkout", checkout, { plan: "pro" }]] as const)("%s production route", (_name, handler, input) => {
  it.each([null, "https://evil.example"])("rejects origin %s before authentication, parsing or provider construction", async originValue => {
    const req = request("{", originValue);
    const response = await handler.POST(req);
    expect(response.status).toBe(403); expect(req.bodyUsed).toBe(false);
    expect(boundary.getUser).not.toHaveBeenCalled();
    expect(boundary.openai).not.toHaveBeenCalled(); expect(boundary.stripe).not.toHaveBeenCalled();
    await expectPrivateFree(response);
  });
  it("rejects anonymous input before parsing or provider effects", async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = request("{"); const response = await handler.POST(req);
    expect(response.status).toBe(401); expect(req.bodyUsed).toBe(false);
    expect(boundary.openai).not.toHaveBeenCalled(); expect(boundary.stripe).not.toHaveBeenCalled();
    await expectPrivateFree(response);
  });
  it("returns only the safe success payload from a doubled provider", async () => {
    const response = await handler.POST(request(JSON.stringify(input)));
    expect(response.status).toBe(200);
    expect(boundary.ai.mock.calls.length + boundary.checkout.mock.calls.length).toBe(1);
    await expectPrivateFree(response);
  });
  it("suppresses private provider exceptions", async () => {
    const error = new Error(privateValues.join(" "));
    boundary.ai.mockRejectedValue(error); boundary.checkout.mockRejectedValue(error);
    const response = await handler.POST(request(JSON.stringify(input)));
    expect(response.status).toBe(503);
    await expectPrivateFree(response);
  });
});

it("requires a webhook signature before the SDK verifier can accept an event", async () => {
  boundary.signature.mockReturnValue(null);
  const response = await webhook.POST(request("synthetic-event"));
  expect(response.status).toBe(400);
  expect(boundary.constructEvent).not.toHaveBeenCalled();
  await expectPrivateFree(response);
});
it("suppresses signature-verifier exceptions without acknowledging an event", async () => {
  boundary.signature.mockReturnValue("synthetic-signature");
  boundary.constructEvent.mockImplementation(() => { throw new Error(privateValues.join(" ")); });
  const response = await webhook.POST(request("synthetic-event"));
  expect(response.status).toBe(400);
  await expectPrivateFree(response);
});
it("acknowledges a verifier-accepted fixture with no private configuration in the response", async () => {
  boundary.signature.mockReturnValue("synthetic-signature");
  boundary.constructEvent.mockReturnValue({ type: "checkout.session.completed" });
  const response = await webhook.POST(request("synthetic-event"));
  expect(response.status).toBe(200);
  expect(boundary.constructEvent).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ received: true });
});
