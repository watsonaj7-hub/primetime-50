import { afterAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { stackConfig, testAccount } from "../local-stack";
import { validProfile } from "../fixture";
import { runDraftOrderCases } from "../sql/draft-orders.mjs";

const config = stackConfig();
if (!["localhost", "127.0.0.1"].includes(new URL(config.DB_URL).hostname)) throw new Error("Only the isolated local SQL endpoint is allowed.");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts: Awaited<ReturnType<typeof testAccount>>[] = [];
afterAll(async () => {
  for (const account of accounts) expect((await admin.auth.admin.deleteUser(account.user.id)).error).toBeNull();
});
it("serializes real concurrent draft/completion transactions in both orders, including rollback and stale snapshots", async () => {
  for (let n = 0; n < 5; n++) accounts.push(await testAccount(config, admin));
  const names = await runDraftOrderCases(
    () => postgres(config.DB_URL, { max: 1, prepare: false, connect_timeout: 5 }),
    accounts.map(account => account.user.id), validProfile
  );
  expect(names).toHaveLength(5);
}, 60000);
it("protects direct authenticated and service-role REST writes after completion", async () => {
  const account = accounts[0];
  if (!account) throw new Error("Concurrency fixture was not established");
  for (const writer of [account.client, admin]) {
    const result = await writer.from("onboarding_drafts").upsert({ user_id: account.user.id, draft_json: { step: 3 } });
    expect(result.error?.code).toBe("55000");
    expect((await writer.from("onboarding_drafts").select("*").eq("user_id", account.user.id)).data).toEqual([]);
  }
  expect((await account.client.rpc("save_foundation_profile", { payload: { ...validProfile, display_name: "Completed edit" } })).error).toBeNull();
  expect((await account.client.from("profiles").select("display_name").single()).data?.display_name).toBe("Completed edit");
  expect((await account.client.from("profiles").update({ onboarding_completed_at: null }).eq("user_id", account.user.id)).error?.code).toBe("55000");
});
