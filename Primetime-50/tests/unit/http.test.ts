import { expect, it, vi } from "vitest";
import { checkOrigin, readJson, errorResponse } from "@/lib/http/errors";
import { profileSchema } from "@/lib/validation/profile";
it("rejects malformed JSON and returns controlled 400", async () => {
  const request = new Request("http://localhost/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: "{" });
  try { await readJson(request); throw new Error("Must reject"); } catch (error) { expect(errorResponse(error).status).toBe(400); }
});
it("rejects oversized JSON", async () => {
  await expect(readJson(new Request("http://localhost/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify("x".repeat(17000)) }))).rejects.toMatchObject({ status: 413 });
});
it("rejects missing and cross-origin mutations", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  expect(() => checkOrigin(new Request("http://localhost:3000/api/profile"))).toThrow();
  expect(() => checkOrigin(new Request("http://localhost:3000/api/profile", { headers: { origin: "https://evil.example" } }))).toThrow();
  expect(() => checkOrigin(new Request("http://localhost:3000/api/profile", { headers: { origin: "http://localhost:3000" } }))).not.toThrow();
  vi.unstubAllEnvs();
});
it("returns field errors without dumping private payloads", async () => {
  const parsed = profileSchema.safeParse({ health_notes: "private details" });
  if (parsed.success) throw new Error("Invalid fixture");
  const result = errorResponse(parsed.error);
  expect(result.status).toBe(422);
  expect(await result.text()).not.toContain("private details");
});
it("hides unexpected provider errors", async () => expect(await errorResponse(new Error("private sentinel secret")).text()).not.toContain("sentinel"));
