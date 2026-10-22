import { decodeHistory, type HistoryRecord } from "@/lib/history/records";
import { workoutId } from "@/lib/validation/workout";
export type HistoryState = { status: "loading" | "ready" | "error" | "signedOut"; records: HistoryRecord[]; selected: HistoryRecord | null; error: string };
const initial = (): HistoryState => ({ status: "loading", records: [], selected: null, error: "" });
// Ephemeral per mounted owner. Each activation/request has an epoch; stale failures also cannot invalidate a newer owner.
export class HistoryController {
  state = initial();
  private epoch = 0;
  private active = true;
  private listeners = new Set<() => void>();
  constructor(private fetcher: typeof fetch, private verifyIdentity: () => Promise<boolean>) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  private update(state: HistoryState) { this.state = state; this.listeners.forEach(fn => fn()); }
  activate = () => { this.active = true; this.epoch++; this.update(initial()); };
  invalidate = () => { this.active = false; this.epoch++; this.update({ ...initial(), status: "signedOut" }); };
  dispose = () => { this.active = false; this.epoch++; };
  async load(id?: string) {
    if (!this.active) return;
    const epoch = ++this.epoch;
    const current = () => this.active && epoch === this.epoch;
    this.update(initial());
    try {
      const verified = await this.verifyIdentity();
      if (!current()) return;
      if (!verified) { this.invalidate(); return; }
      const read = async (url: string) => {
        const response = await this.fetcher(url, { cache: "no-store", credentials: "same-origin" });
        if (!current()) throw new Error("Stale history read.");
        if (response.status === 401) { this.invalidate(); throw new Error("Sign in again."); }
        if (!response.ok) throw new Error("History could not be loaded. Check your connection and retry.");
        const json: unknown = await response.json();
        if (!current()) throw new Error("Stale history response.");
        try { return decodeHistory(json); } catch { throw new Error("Saved history could not be verified. Retry loading; no records have been changed."); }
      };
      const selectedId = id === undefined ? undefined : workoutId.parse(id);
      const records = await read("/api/workouts?view=history");
      let selected: HistoryRecord | null = null;
      if (selectedId) {
        const result = await read(`/api/workouts?view=history&id=${encodeURIComponent(selectedId)}`);
        if (result.length !== 1 || result[0].id !== selectedId) throw new Error("The original completed workout was not found. No replacement has been opened.");
        selected = result[0];
      }
      // Recheck identity after the read as well as before it, without trusting returned owner fields.
      const stillVerified = await this.verifyIdentity();
      if (!current()) return;
      if (!stillVerified) { this.invalidate(); return; }
      this.update({ status: "ready", records, selected, error: "" });
    } catch (error) {
      if (current()) this.update({ ...initial(), status: "error", error: error instanceof Error ? error.message : "History could not be loaded. Retry loading." });
    }
  }
}
