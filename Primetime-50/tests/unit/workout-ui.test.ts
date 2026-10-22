// Local source/component checks only. No browser or connected database claim.
import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayWorkout } from "@/components/today-workout";
import { WorkoutView } from "@/components/workout/workout-experience";
import { WorkoutController, draftsFor, type Availability } from "@/lib/client/workout";
import { testRecord } from "./workout-fixture";

it("never renders the fixed demo prescription as today's available training", () => {
  const html = renderToStaticMarkup(createElement(TodayWorkout));
  expect(html).not.toContain("Goblet box squat");
  expect(html).not.toContain("Pain-free range");
});

it("renders independent labelled slots, provenance, exact guidance and honest historical state", () => {
  const c = new WorkoutController(fetch, async () => true, () => {});
  const r = testRecord();
  const html = renderToStaticMarkup(createElement(WorkoutView, { controller: c, state: { ...c.state, record: r, drafts: draftsFor(r) } }));
  for (const s of r.exercise_set_logs) for (const field of ["reps","weight","rpe"]) {
    expect(html).toContain(`for="${s.id}-${field}"`); expect(html).toContain(`id="${s.id}-${field}"`);
  }
  expect(html).toContain("TEST screening"); expect(html).toContain("TEST referral"); expect(html).toContain("TEST progression"); expect(html).toContain("TEST measurement");
  expect(html).toContain("https://example.invalid/TEST-ONLY"); expect(html).toContain("TEST ONLY NOT A REAL REVIEWER");
  expect(html).toContain("does not confirm current eligibility or approval"); expect(html).not.toContain("placeholder=");
});

it.each(["unavailable","unsupported","referral_required"] as const)("renders truthful %s with no start/log prescription", state => {
  const c = new WorkoutController(fetch, async () => true, () => {});
  const availability: Availability = { state, workouts: [] };
  const html = renderToStaticMarkup(createElement(WorkoutView, { controller: c, state: { ...c.state, availability } }));
  expect(html).not.toContain("Start selected workout"); expect(html).not.toContain("Save entries"); expect(html).not.toContain("TEST reps");
});

it("shows completed records read-only and duration prescriptions without invented conversions", () => {
  const c = new WorkoutController(fetch, async () => true, () => {}); const r = testRecord();
  r.completed = true; r.completed_at = "2026-10-22T01:00:00Z";
  r.prescription_snapshot.prescription.exercises[0].reps = null; r.prescription_snapshot.prescription.exercises[0].duration_seconds = 35;
  const html = renderToStaticMarkup(createElement(WorkoutView, { controller: c, state: { ...c.state, record: r, drafts: draftsFor(r) } }));
  expect(html).toContain("35 seconds per set"); expect(html).toContain("does not record duration or convert seconds to reps");
  expect(html).toContain("disabled"); expect(html).not.toContain("Complete workout</button>"); expect(html).not.toContain("Save entries</button>");
});

it("offers a real workout navigation link instead of inert Log/Swap buttons", () => {
  const html = renderToStaticMarkup(createElement(TodayWorkout));
  expect(html).toContain('href="/workout"');
  expect(html).not.toContain("Swap exercise");
  expect(html).not.toContain("<button");
});
it("previews only the exact fresh generated selection hint and shows a refusal for a revoked hint", () => {
  const c = new WorkoutController(fetch,async()=>true,()=>{}); const r=testRecord();
  const availability: Availability={state:"available",workouts:[{catalogue_version_id:r.catalogue_version_id,prescription_snapshot:r.prescription_snapshot}]};
  let html=renderToStaticMarkup(createElement(WorkoutView,{controller:c,state:{...c.state,availability,selectionHint:r.catalogue_version_id,hintUnavailable:false}}));
  expect(html).toContain("TEST screening"); expect(html).toContain("Review this freshly available version"); expect(html).toContain("checked");
  html=renderToStaticMarkup(createElement(WorkoutView,{controller:c,state:{...c.state,availability,selectionHint:"71000000-0000-4000-8000-000000000099",hintUnavailable:true}}));
  expect(html).toContain("requested catalogue version is not currently available"); expect(html).not.toContain("TEST screening"); expect(html).not.toContain("checked");
});
