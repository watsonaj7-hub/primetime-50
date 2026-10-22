import { z } from "zod";
import { decodeGeneratedRecord, decodeGeneratedRecords, progressionStatusSchema, type SavedGeneratedPlan, type ProgressionStatus } from "@/lib/ai/generated-records";
export type GeneratedState = {
  status: "loading" | "ready" | "error" | "signedOut"; busy: boolean; plans: SavedGeneratedPlan[]; progression: ProgressionStatus | null;
  message: string; error: string; requestId: string | null; reconciled: boolean;
  outcome: null | "review_required" | "limit" | "in_progress" | "unavailable" | "unconfirmed";
};
const initial = (): GeneratedState => ({ status: "loading", busy: false, plans: [], progression: null, message: "Loading saved generated plans…", error: "", requestId: null, reconciled: false, outcome: null });
class Refusal extends Error { constructor(public status: number, public outcome: GeneratedState["outcome"]) { super("Generation did not confirm a saved plan. Check the original request before retrying."); } }
export class GeneratedController {
  state = initial();
  private epoch = 0;
  private active = true;
  private listeners = new Set<() => void>();
  constructor(private fetcher: typeof fetch, private verifyIdentity: () => Promise<boolean>, private remember: (id: string | null) => void = () => {}) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<GeneratedState>) { this.state={...this.state,...patch}; this.listeners.forEach(f => f()); }
  activate = () => { this.epoch++; this.active=true; this.update(initial()); };
  invalidate = () => { this.epoch++; this.active=false; this.update({ ...initial(), status: "signedOut", message: "Your session changed. Reload and sign in before continuing." }); };
  dispose = () => { this.active=false; this.epoch++; this.update(initial()); };
  private current(epoch: number) { if (!this.active || epoch !== this.epoch) throw new Error("Stale generated request."); }
  private async request(epoch: number, url: string, payload?: unknown) {
    this.current(epoch);
    const res = await this.fetcher(url,{ method: payload ? "POST" : "GET", cache: "no-store", credentials: "same-origin", headers: payload ? { "Content-Type":"application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    this.current(epoch);
    if (res.status === 401) { this.invalidate(); throw new Error("Sign in again."); }
    const value: unknown = await res.json(); this.current(epoch);
    if (!res.ok) {
      const message=z.object({ error:z.string() }).safeParse(value);
      const outcome = res.status===429 ? "limit" : res.status===409 && message.success && message.data.error.includes("health review") ? "review_required" : res.status===409 && message.success && message.data.error.includes("already being processed") ? "in_progress" : "unavailable";
      throw new Refusal(res.status,outcome);
    }
    return value;
  }
  private async run(action: (epoch: number) => Promise<void>, pendingMessage?: string) {
    if (!this.active || this.state.busy) return;
    const epoch=this.epoch; this.update({ busy:true,error:"",outcome:null, ...(pendingMessage ? {message:pendingMessage} : {}) });
    try {
      const verified=await this.verifyIdentity(); this.current(epoch);
      if (!verified) { this.invalidate(); return; }
      await action(epoch);
    } catch (e) {
      if (this.active && epoch===this.epoch) this.update({ status:"error", plans:[], outcome:e instanceof Refusal ? e.outcome : "unconfirmed", error: "The request could not be confirmed. No provisional prescription is shown. Check saved plans or the original request before retrying.", message:"" });
    } finally { if (this.active && epoch===this.epoch) this.update({busy:false}); }
  }
  async load(originalRequestId?: string) {
    return this.run(async epoch => {
      if (originalRequestId !== undefined) this.update({requestId:z.string().uuid().parse(originalRequestId),reconciled:false});
      const raw=z.object({plans:z.unknown(),progression:progressionStatusSchema}).strict().parse(await this.request(epoch,"/api/ai/plan"));
      const plans=decodeGeneratedRecords(raw.plans); this.current(epoch);
      this.update({plans,progression:raw.progression,status:"ready",message:"Saved generated plans checked. Saved approval is historical."});
    }, "Loading saved generated plans… Saved approval is historical.");
  }
  async generate() {
    return this.run(async epoch => {
      // Every ambiguous attempt/retry retains this original identity until explicit
      // acknowledgement of a confirmed saved plan. No automatic POST retries.
      const requestId=this.state.requestId ?? crypto.randomUUID();
      this.remember(requestId);
      this.update({requestId,reconciled:false,plans:[],message:"Requesting a validated plan…"});
      const raw=z.object({plan:z.unknown()}).strict().parse(await this.request(epoch,"/api/ai/plan",{request_id:requestId}));
      const plan=decodeGeneratedRecord(raw.plan);
      if (plan.request_id!==requestId) throw new Error("Original identity mismatch.");
      this.current(epoch); this.update({plans:[plan],status:"ready",reconciled:true,message:"Saved plan confirmed. Review its historical provenance before continuing."});
    });
  }
  async reconcile() {
    return this.run(async epoch => {
      const id=this.state.requestId;
      if (!id) throw new Error("No original request to reconcile.");
      const raw=z.object({plans:z.unknown(),progression:progressionStatusSchema}).strict().parse(await this.request(epoch,`/api/ai/plan?request_id=${encodeURIComponent(id)}`));
      const plans=decodeGeneratedRecords(raw.plans);
      if (plans.length>1 || plans.some(p=>p.request_id!==id)) throw new Error("Original identity mismatch.");
      this.current(epoch); this.update({plans,progression:raw.progression,status:"ready",reconciled:plans.length===1,message:plans.length ? "Original saved plan confirmed." : "No saved plan found for the original request. This does not prove that a pending request failed."});
    }, "Checking original generation request… Saved approval is historical.");
  }
  newRequest() { if (this.active && !this.state.busy && this.state.reconciled) { this.remember(null); this.update({requestId:null,reconciled:false,outcome:null,error:"",message:"You may explicitly request another plan."}); } }
}
