import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { stackConfig } from "../local-stack";

// Tests deliberately fail when the isolated stack is unavailable; no silent skips.
const config = stackConfig();
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

test("register, confirm, onboard, save, log out/in and edit a private profile", async ({ page, request }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  let userId: string | undefined;
  try {
    await page.goto("/register");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    // Local test admin confirms this test user's signup, matching the provider's email gate.
    // The real callback exchange is separately covered by magic-link login below.
    const users = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = users.data.users.find(u => u.email === email)?.id;
    expect(userId).toBeTruthy();
    expect((await admin.auth.admin.updateUserById(userId!, { email_confirm: true })).error).toBeNull();
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Display name", { exact: true }).fill("Browser member");
    await page.getByLabel("Date of birth", { exact: true }).fill("1965-04-12");
    await page.getByLabel("Height (cm)", { exact: true }).fill("175");
    await page.getByLabel("Weight (kg)", { exact: true }).fill("82");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Draft saved to your account.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Step 2 of 4: Goals and training", { exact: true })).toBeVisible();
    await page.getByLabel("Fitness level", { exact: true }).selectOption("beginner");
    await page.getByLabel("Primary goal", { exact: true }).selectOption("strength");
    await page.getByLabel("Training location", { exact: true }).selectOption("home");
    await page.getByLabel("Training days per week", { exact: true }).fill("3");
    await page.getByLabel("Session duration (minutes)", { exact: true }).fill("45");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Health limitations", { exact: true }).selectOption("none_reported");
    await page.getByLabel("Dumbbells", { exact: true }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your profile is saved" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/settings");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Browser member");
    await expect(page.getByLabel("Training days per week", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Dumbbells", { exact: true })).toBeChecked();
    expect((await page.request.get("/admin")).status()).toBe(403);
    const before = (await (await page.request.get("/api/profile")).json()).profile;
    const invalid = await page.request.put("/api/profile", { headers: { Origin: "http://127.0.0.1:3100" }, data: { ...Object.fromEntries(Object.entries(before).filter(([key]) => !["updated_at", "onboarding_completed_at"].includes(key))), user_id: randomUUID() } });
    expect(invalid.status()).toBe(422);
    await page.route("**/api/profile", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test network failure" }) }));
    await page.getByLabel("Display name", { exact: true }).fill("Updated member");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Test network failure");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Updated member");
    await page.unroute("**/api/profile");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your settings are saved");
    await page.reload();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Updated member");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Actual provider-issued one-use email hash verifies the callback route; local admin only.
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "http://127.0.0.1:3100/auth/callback" } });
    expect(link.error).toBeNull();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.goto(`/auth/callback?token_hash=${encodeURIComponent(link.data.properties!.hashed_token)}&type=magiclink&next=/settings`);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Updated member");
    expect((await request.get("/api/profile")).status()).toBe(401);
  } finally {
    if (!userId) { const users = await admin.auth.admin.listUsers({ perPage: 1000 }); userId = users.data.users.find(u => u.email === email)?.id; }
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
