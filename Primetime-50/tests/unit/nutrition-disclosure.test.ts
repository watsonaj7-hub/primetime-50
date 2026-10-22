import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const account = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: account.createClient }));
import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

async function renderedNutrition() {
  // Invoke the real async server shell and production nutrition component.
  // No configured account service, browser, database or provider is contacted.
  return renderToStaticMarkup(await AppShell({ children: createElement(NutritionPanel) }));
}
it("describes owned target-free nutrition logging without calling it sample content or claiming connected acceptance", async () => {
  const html = await renderedNutrition();
  expect(html).not.toContain("Nutrition, coach and exercise library panels contain sample content.");
  expect(html).toContain("Nutrition logs use your entered meals, protein and water, without personalised targets. Saving requires configured account services.");
  expect(html).toContain("Nutrition log");
  expect(html).not.toContain("1,920");
  expect(account.createClient).not.toHaveBeenCalled();
});
it("preserves truthful coach/library limits and every history, unavailable-analytics and reviewed-workout caveat", async () => {
  const html = await renderedNutrition();
  expect(html).toContain("General chat is unavailable; public exercise guidance is withheld pending review.");
  expect(html).not.toContain("coach and exercise library panels contain sample content.");
  expect(html).toContain("History uses saved workout records; habit and body measurement analytics are unavailable.");
  expect(html).toContain("Reviewed workouts require supported saved information and approved content.");
});
