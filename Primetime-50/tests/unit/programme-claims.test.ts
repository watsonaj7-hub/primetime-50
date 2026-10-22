import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";

const account = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: account.createClient }));
import Home from "@/app/page";
import CoachPage from "@/app/coach/page";
import LibraryPage from "@/app/library/page";
import SubscriptionPage from "@/app/subscription/page";
import { metadata } from "@/app/layout";
import { AppShell } from "@/components/app-shell";
import { CoachPanel } from "@/components/coach-panel";
import { ExerciseSpotlight } from "@/components/exercise-spotlight";
import { starterExercises } from "@/lib/exercises";

const network = vi.fn(() => { throw new Error("Network forbidden in claims rendering checks"); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(account.createClient).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function renderPage(Page: () => ReactElement<{ children: ReactNode }>) {
  const page = Page();
  expect(page.type).toBe(AppShell);
  // Resolve the real async server shell. All children are real production components;
  // SSR does not run browser effects or establish connected-service acceptance.
  return renderToStaticMarkup(await AppShell(page.props));
}
function link(html: string, href: string, text: string) {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
  expect(anchors.some(a => a.includes(`href="${href}"`) && a.includes(text))).toBe(true);
  expect(existsSync(`app${href === "/" ? "" : href}/page.tsx`)).toBe(true);
}
function noAdvice(html: string) {
  for (const exercise of starterExercises) {
    for (const field of ["cues", "contraindications", "regression", "progression"] as const) {
      expect(html, `${exercise.name}: unreviewed ${field}`).not.toContain(exercise[field]);
    }
  }
}
function noUnsupportedClaims(html: string) {
  for (const claim of ["You completed all planned sets", "RPE 6-7", "2.5%", "sleep stays above 7 hours", "triggers a safety flag", "are flagged for review", "Loads rise conservatively", "Every plan includes joint-friendly", "simple nutrition targets", "AI coaching guardrails", "Ask the AI coach", "Open coach chat", "adjust safely", "filtered for low-impact training"]) {
    expect(html).not.toContain(claim);
  }
}
it("removes fabricated performance and load prescriptions from the real coach panel", () => {
  const html = renderToStaticMarkup(createElement(CoachPanel));
  noUnsupportedClaims(html);
  expect(html).toContain("Automatic progression is unavailable");
  expect(html).toContain("approved progression and recovery rules");
  expect(html).toContain("does not monitor symptoms or provide health clearance");
  link(html, "/progress", "Open workout history");
});
it("renders the home route without unsupported capability or public exercise advice", async () => {
  const html = await renderPage(Home);
  noUnsupportedClaims(html);
  noAdvice(html);
  expect(html).toContain("Train stronger after 50");
  link(html, "/onboarding", "Start onboarding");
  link(html, "/workout", "View reviewed workouts");
});
it("preserves home workout/history/nutrition and unavailable analytics semantics", async () => {
  const html = await renderPage(Home);
  for (const text of ["Nutrition log", "Protein (g)", "Water (mL)", "Observed load comparisons", "Habit completion and streaks are unavailable.", "History uses saved workout records", "Reviewed workouts require supported saved information and approved content."]) expect(html).toContain(text);
  expect(html).toContain("Nutrition logs use your entered meals, protein and water, without personalised targets. Saving requires configured account services.");
  expect(html).not.toContain("coach and exercise library panels contain sample content.");
  link(html, "/progress", "Open workout history");
  link(html, "/nutrition", "Meals");
});
it("replaces inert chat with an informative state and real next navigation", async () => {
  const html = await renderPage(CoachPage);
  noUnsupportedClaims(html);
  expect(html).toContain("Coach availability");
  expect(html).toContain("General chat is unavailable");
  expect(html).toContain("Automatic progression is unavailable");
  expect(html).not.toMatch(/<textarea|<form|Send to coach|AI coach chat/);
  link(html, "/workout", "View reviewed workouts");
  link(html, "/progress", "Open workout history");
  link(html, "/onboarding", "Review saved profile");
});
it("withholds every public library cue, contraindication, regression and progression", async () => {
  const html = await renderPage(LibraryPage);
  noAdvice(html);
  expect(html).toContain("Exercise library");
  expect(html).toContain("Exercise guidance is withheld pending review");
  expect(html).toContain("Austin");
  expect(html).not.toContain("50 starter exercises");
  link(html, "/workout", "View reviewed workouts");
});
it("withholds the unreviewed spotlight and its implied low-impact clearance", () => {
  const html = renderToStaticMarkup(createElement(ExerciseSpotlight));
  noAdvice(html);
  noUnsupportedClaims(html);
  for (const exercise of starterExercises) expect(html).not.toContain(exercise.name);
  expect(html).toContain("Exercise guidance is withheld pending review");
  link(html, "/workout", "View reviewed workouts");
});
it("does not sell unsupported coaching/imports or offer inert checkout controls", async () => {
  const html = await renderPage(SubscriptionPage);
  for (const claim of ["$19", "$39", "Stripe-ready checkout", "Advanced AI coaching", "wearable imports", "priority support", "Current plan", "Upgrade"]) expect(html).not.toContain(claim);
  expect(html).not.toContain("<button");
  expect(html).toContain("Paid subscriptions and checkout are unavailable");
  link(html, "/workout", "View reviewed workouts");
});
it("metadata describes tracking without safety or AI capability promises", () => {
  expect(metadata.title).toBe("PrimeFit 50+");
  expect(metadata.description).not.toMatch(/safe|AI coaching/i);
  expect(metadata.description).toContain("workout");
});
