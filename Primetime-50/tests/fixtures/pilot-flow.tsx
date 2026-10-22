// TEST DATA ONLY. Production views/controllers; synthetic identity and disposable
// in-memory transport. Never mount in an application route or contact a backend.
import { useEffect, useState, useSyncExternalStore } from "react";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { WorkoutView } from "@/components/workout/workout-experience";
import { HistoryView } from "@/components/history/history-experience";
import { WorkoutController } from "@/lib/client/workout";
import { HistoryController } from "@/lib/client/history";
import { profileSchema, type SavedProfile } from "@/lib/validation/profile";
import { validProfile } from "../fixture";
import { testRecord } from "../unit/workout-fixture";
import { partialDraft } from "../fixture";
import type { OnboardingDraft } from "@/lib/validation/draft";
import { completeWorkoutSchema, saveWorkoutSchema, startWorkoutSchema } from "@/lib/validation/workout";

export function pilotFixture() {
  let record: ReturnType<typeof testRecord> | null = null;
  let profile: SavedProfile | null = null;
  let draft: OnboardingDraft | null = null;
  let signedIn = true, fail = false, delay = false;
  let release: (() => void) | null = null;
  const calls: string[] = [];
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.origin !== "http://localhost" || !url.pathname.startsWith("/api/")) throw new Error("TEST DATA ONLY refuses external transport");
    const method = init?.method ?? "GET"; const write = method !== "GET"; calls.push(`${method} ${url.pathname}`);
    if (!signedIn) return response({ error: "TEST DATA ONLY signed out" },401);
    if (write && url.pathname !== "/api/profile/draft") {
      if (delay) { delay = false; await new Promise<void>(resolve => { release = resolve; }); release = null; }
      if (!signedIn) return response({ error: "TEST DATA ONLY signed out" },401);
      if (fail) { fail = false; return response({ error: "TEST DATA ONLY write failed. Entries are retained; retry." },503); }
    }
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.pathname === "/api/profile/draft") {
      if (write) draft = structuredClone(body);
      return response({ draft });
    }
    if (url.pathname === "/api/profile") {
      if (write) {
        const parsed = profileSchema.safeParse(body);
        if (!parsed.success) return response({ error: "TEST DATA ONLY invalid profile" },422);
        profile = { ...parsed.data, updated_at: "2026-10-22T01:00:00Z", onboarding_completed_at: "2026-10-22T01:00:00Z" }; draft = null;
      }
      return response({ profile });
    }
    if (url.pathname !== "/api/workouts" && url.pathname !== "/api/workouts/complete") throw new Error("TEST DATA ONLY unknown route");
    if (method === "GET") {
      if (url.searchParams.get("view") === "reviewed-availability") return response({ availability: profile ? { state: "available", workouts: [{ catalogue_version_id: testRecord().catalogue_version_id, prescription_snapshot: testRecord().prescription_snapshot }] } : { state: "unsupported", workouts: [] } });
      const id = url.searchParams.get("id");
      return response({ workouts: record && (!id || id === record.id) && (url.searchParams.get("view") !== "history" || record.completed) ? [record] : [] });
    }
    if (method === "POST" && url.pathname === "/api/workouts") {
      const parsed = startWorkoutSchema.safeParse(body);
      if (!profile || !parsed.success || parsed.data.catalogue_version_id !== testRecord().catalogue_version_id) return response({},409);
      if (record && record.id !== parsed.data.id) return response({},409);
      record ??= { ...testRecord(), id: parsed.data.id, record_timezone: parsed.data.timezone }; return response({ workout: record });
    }
    if (!record || body.id !== record.id) return response({},404);
    if (url.pathname.endsWith("/complete") && record.completed) return response({ workout: record });
    if (record.completed || body.expected_revision !== record.revision) return response({},409);
    if (method === "PUT") {
      const parsed = saveWorkoutSchema.safeParse(body); if (!parsed.success) return response({},422);
      for (const set of parsed.data.sets) {
        const slot = record.exercise_set_logs.find(s => s.id === set.id); if (!slot) return response({},422);
        Object.assign(slot,set);
      }
    } else {
      if (!completeWorkoutSchema.safeParse(body).success || record.exercise_set_logs.some(s => s.reps === null || s.weight === null || s.rpe === null)) return response({},409);
      record.completed = true; record.completed_at = "2026-10-22T01:00:00Z";
    }
    record.revision++; return response({ workout: record });
  };
  return { transport, calls, profile: () => profile, draft: () => draft, failNext: () => { fail = true; }, delayNext: () => { delay = true; }, release: () => release?.(), signOut: () => { signedIn = false; }, signIn: () => { signedIn = true; }, verify: async () => signedIn };
}

type Screen = "onboarding" | "settings" | "workout" | "history";
export function PilotFlowFixture() {
  const [fixture] = useState(pilotFixture);
  const [workout] = useState(() => new WorkoutController(fixture.transport,fixture.verify,() => {}));
  const [history] = useState(() => new HistoryController(fixture.transport,fixture.verify));
  const ws = useSyncExternalStore(workout.subscribe,workout.getSnapshot,workout.getSnapshot);
  const hs = useSyncExternalStore(history.subscribe,history.getSnapshot,history.getSnapshot);
  const [screen,setScreen] = useState<Screen>("onboarding");
  const [notice,setNotice] = useState("");
  const [ready,setReady] = useState(false);
  const [mount,setMount] = useState(0);
  useEffect(() => {
    // Only this isolated fixture owns global fetch, for the unmodified ProfileForm.
    const original = window.fetch; window.fetch = fixture.transport; setReady(true);
    return () => { window.fetch = original; workout.dispose(); history.dispose(); };
  },[fixture,workout,history]);
  function navigate(next: Screen, id?: string) {
    setScreen(next); setMount(n => n+1);
    if (next === "workout") { workout.activate(); void workout.load(id); }
    if (next === "history") { history.activate(); void history.load(id); }
  }
  const values = Object.fromEntries(Object.entries(validProfile).filter(([,v]) => !Array.isArray(v)).map(([k,v]) => [k,v === null ? "" : String(v)]));
  const startingDraft: OnboardingDraft = { ...partialDraft, step: 0, values: { ...partialDraft.values,...values, display_name: "TEST DATA ONLY member" }, equipment: validProfile.equipment, healthRestrictions: [] };
  return <main className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-5 [overflow-wrap:anywhere]" onClick={event => {
    const a = (event.target as HTMLElement).closest("a"); if (!a) return;
    const url = new URL(a.href); const next = ({ "/settings": "settings", "/workout": "workout", "/progress": "history", "/onboarding": "onboarding" } as const)[url.pathname as "/settings"];
    event.preventDefault(); if (next) navigate(next,url.searchParams.get("id") ?? undefined); else setNotice("TEST DATA ONLY: destination requires the real application; no external navigation.");
  }}>
    <h1 className="text-2xl font-bold">TEST DATA ONLY pilot workflow fixture</h1>
    <p>Production components and controllers. Synthetic identity, fictional review and in-memory transport only. Reload discards all data. No connected database, professional approval or pilot consent.</p>
    <nav aria-label="TEST DATA ONLY workflow" className="flex flex-wrap gap-3">{(["onboarding","settings","workout","history"] as const).map(next => <button key={next} className="rounded border p-3 focus-visible:outline focus-visible:outline-2" onClick={() => navigate(next)}>{next}</button>)}</nav>
    <fieldset className="flex min-w-0 flex-wrap gap-3 rounded border p-3"><legend>TEST DATA ONLY transport controls</legend>
      <button onClick={() => { fixture.failNext(); setNotice("Next non-draft write will fail with synthetic 503."); }}>Fail next write</button>
      <button onClick={() => { fixture.delayNext(); setNotice("Next non-draft write will wait for Release write."); }}>Delay next write</button>
      <button onClick={() => { fixture.release(); setNotice("Held write released."); }}>Release write</button>
      <button onClick={() => { fixture.signOut(); workout.invalidate(); history.invalidate(); setNotice("Synthetic signed out. No real account used."); }}>Synthetic sign out</button>
      <button onClick={() => { fixture.signIn(); navigate(screen,workout.state.record?.id); setNotice("Synthetic returning identity. In-memory data retained."); }}>Synthetic sign in</button>
    </fieldset>
    <p role="status">{notice}</p>
    {ready && (screen === "onboarding" ? <ProfileForm key={mount} profile={null} draft={fixture.draft() ?? startingDraft} onboarding /> : screen === "settings" ? fixture.profile() ? <ProfileForm key={mount} profile={fixture.profile()} /> : <p>Complete onboarding first. No synthetic saved profile yet.</p> : screen === "workout" ? <WorkoutView state={ws} controller={workout} /> : <HistoryView state={hs} retry={() => void history.load()} />)}
  </main>;
}
