import { test, expect } from "@playwright/test";

test("anonymous users cannot reach protected pages or private profile API", async ({ page, request }) => {
  for (const route of ["/workout", "/nutrition", "/progress", "/coach", "/settings", "/onboarding", "/admin"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp("/login\\?next="));
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  }
  const result = await request.get("/api/profile");
  expect([401,503]).toContain(result.status());
  expect(await result.text()).not.toContain("health_notes");
});
test("cross-origin writes are refused before any profile changes", async ({ request }) => {
  const response = await request.put("/api/profile", { headers: { Origin: "https://evil.example" }, data: {} });
  expect(response.status()).toBe(403);
});
test("invalid callback redirects remain on the application", async ({ page }) => {
  await page.goto("/auth/callback?next=https://evil.example&code=invalid");
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/login\?error=callback/);
  await expect(page.getByText("Your sign-in link could not be verified. Please request another link.", { exact: true })).toBeVisible();
});
test("register controls are labelled, and public exercise content still works", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
  await page.goto("/library");
  await expect(page.locator("article")).toHaveCount(50);
  await expect(page.getByText("sample content", { exact: false })).toBeVisible();
});
