import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { stackConfig } from "../local-stack";
import { validProfile } from "../fixture";

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
    expect(await (await page.request.get("/api/profile")).json()).toEqual({ profile: null });
    expect(await (await page.request.get("/api/profile/draft")).json()).toEqual({ draft: null });
    await page.goto("/settings");
    await expect(page.getByText("Your profile is incomplete.", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Complete onboarding" }).click();
    await page.getByLabel("Display name", { exact: true }).fill("Browser member");
    await page.getByLabel("Date of birth", { exact: true }).fill("1965-04-12");
    await page.getByLabel("Height (cm)", { exact: true }).fill("175");
    await page.getByLabel("Weight (kg)", { exact: true }).fill("82");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Draft saved to your account.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Step 2 of 4: Goals and training", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Browser member");
    await expect(page.getByLabel("Date of birth", { exact: true })).toHaveValue("1965-04-12");
    await expect(page.getByLabel("Height (cm)", { exact: true })).toHaveValue("175");
    await expect(page.getByLabel("Weight (kg)", { exact: true })).toHaveValue("82");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Fitness level", { exact: true }).selectOption("beginner");
    await page.getByLabel("Primary goal", { exact: true }).selectOption("strength");
    await page.getByLabel("Training location", { exact: true }).selectOption("home");
    await page.getByLabel("Training days per week", { exact: true }).fill("3");
    await page.getByLabel("Session duration (minutes)", { exact: true }).fill("45");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Health limitations", { exact: true }).selectOption("none_reported");
    await page.getByLabel("Dumbbells", { exact: true }).check();
    const completionRequests: string[] = [];
    page.on("request", request => {
      if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/profile") completionRequests.push(request.url());
    });
    // Continue is navigation, including keyboard activation. It must not become
    // a submit button during its own native click default action (I2).
    for (const activation of ["keyboard", "click"]) {
      const continueButton = page.getByRole("button", { name: "Continue", exact: true });
      if (activation === "keyboard") await continueButton.press("Enter");
      else await continueButton.click();
      await expect(page.getByRole("heading", { name: "Review your profile", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save profile", exact: true })).toBeEnabled();
      await expect(page.locator("form").filter({ has: page.getByRole("heading", { name: "Review your profile", exact: true }) })).toHaveAttribute("aria-busy", "false");
      expect(completionRequests).toEqual([]);
      if (activation === "keyboard") await page.getByRole("button", { name: "Back", exact: true }).click();
    }
    await page.getByRole("button", { name: "Save profile", exact: true }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Your profile is saved" })).toBeVisible();
    expect(completionRequests).toHaveLength(1);
    const completed = (await (await page.request.get("/api/profile")).json()).profile;
    expect(Object.fromEntries(Object.entries(completed).filter(([key]) => !["updated_at", "onboarding_completed_at"].includes(key)))).toEqual({
      display_name: "Browser member", date_of_birth: "1965-04-12", sex: "not_specified", unit_system: "metric",
      height_cm: 175, weight_kg: 82, waist_cm: null, fitness_level: "beginner",
      primary_goal: "strength", secondary_goal: null, training_location: "home",
      training_days_per_week: 3, preferred_session_minutes: 45,
      health_status: "none_reported", health_restrictions: [], health_notes: "", equipment: ["dumbbells"]
    });
    expect(await (await page.request.get("/api/profile/draft")).json()).toEqual({ draft: null });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/settings");
    expect((await (await page.request.get("/api/profile")).json()).profile).toEqual(completed);
    await page.reload();
    expect((await (await page.request.get("/api/profile")).json()).profile).toEqual(completed);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Browser member");
    await expect(page.getByLabel("Training days per week", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Dumbbells", { exact: true })).toBeChecked();
    expect((await page.request.get("/admin")).status()).toBe(403);
    const before = (await (await page.request.get("/api/profile")).json()).profile;
    const invalid = await page.request.put("/api/profile", { headers: { Origin: "http://127.0.0.1:3100" }, data: { ...Object.fromEntries(Object.entries(before).filter(([key]) => !["updated_at", "onboarding_completed_at"].includes(key))), user_id: randomUUID() } });
    expect(invalid.status()).toBe(422);
    let releaseFailure!: () => void;
    const failureGate = new Promise<void>(resolve => { releaseFailure = resolve; });
    let saveRequests = 0;
    await page.route("**/api/profile", async route => {
      saveRequests++;
      await failureGate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test network failure. Please try again." }) });
    });
    await page.getByLabel("Display name", { exact: true }).fill("Updated member");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Display name", { exact: true })).toBeDisabled();
    releaseFailure();
    await expect(page.getByRole("alert")).toContainText("Test network failure");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Updated member");
    expect(saveRequests).toBe(1);
    await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeEnabled();
    await page.unroute("**/api/profile");
    expect((await (await page.request.get("/api/profile")).json()).profile).toEqual(completed);
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

test("an in-flight autosave arriving after completion is denied truthfully and cannot recreate the draft", async ({ page }) => {
  const email = `draft-race-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const account = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(account.error).toBeNull();
  const userId = account.data.user!.id;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const intercepted = new Promise<void>(resolve => { started = resolve; });
  try {
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.route("**/api/profile/draft", async route => {
      if (route.request().method() !== "PUT") return route.continue();
      started();
      await gate;
      await route.continue(); // Real handler/Auth/PostgREST/trigger, no fake success.
    });
    await page.getByLabel("Display name", { exact: true }).fill("Retained pending draft");
    await intercepted;
    const completion = await page.request.put("/api/profile", {
      headers: { Origin: "http://127.0.0.1:3100" }, data: validProfile
    });
    expect(completion.status()).toBe(200);
    release();
    await expect(page.getByText("Your profile is already complete. This draft was not saved. Use Settings to make changes.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Retained pending draft");
    expect(await (await page.request.get("/api/profile/draft")).json()).toEqual({ draft: null });
    await page.goto("/settings");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(validProfile.display_name);
    await page.getByLabel("Display name", { exact: true }).fill("Completed profile edit");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your settings are saved");
    expect(await (await page.request.get("/api/profile/draft")).json()).toEqual({ draft: null });
  } finally {
    release();
    await page.unroute("**/api/profile/draft");
    expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
