import 'server-only';
import { AppError } from '@/lib/http/errors';
import { trustedContextSchema, validateGeneratedPlan, type GeneratedPlan, type TrustedContext } from './generated-contract';
import type { Json } from '@/lib/types';
export type GenerationBoundary = {
  reserve: (id: string) => Promise<unknown>;
  provider: (context: TrustedContext, signal: AbortSignal) => Promise<string>;
  finish: (id: string, plan: GeneratedPlan) => Promise<Json>;
  fail: (id: string) => Promise<void>;
};
// Dependency injection belongs to the server module, never to HTTP input or an environment test flag.
export async function generateWith(id: string, boundary: GenerationBoundary): Promise<Json> {
  const reservation = await boundary.reserve(id) as { state?: string; context?: unknown; plan?: Json } | null;
  if (reservation?.state === 'complete' && reservation.plan) return reservation.plan;
  if (reservation?.state !== 'reserved') {
    if (reservation?.state === 'referral_required') throw new AppError(409, 'Generation requires a health review. No plan was created.');
    if (reservation?.state === 'budget_exhausted') throw new AppError(429, 'Generation limit reached. No plan was created.');
    if (reservation?.state === 'in_progress') throw new AppError(409, 'This generation request is already being processed.');
    throw new AppError(503, 'Generated workouts are unavailable. No plan was created.');
  }
  try {
    const context = trustedContextSchema.parse(reservation.context);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raw: string;
    try {
      raw = await Promise.race([
        boundary.provider(context, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Provider deadline')); }, 10_000); })
      ]);
    } finally { clearTimeout(timer); }
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 16_384) throw new Error('Invalid provider response');
    const plan = validateGeneratedPlan(JSON.parse(raw), context);
    // Storage rechecks current approval/context, revalidates and supplies all provenance.
    return await boundary.finish(id, plan);
  } catch {
    // Failure never refunds a spend reservation or permits an idempotency retry call.
    try { await boundary.fail(id); } catch { /* A pending/expired reservation is also non-retryable. */ }
    throw new AppError(503, 'A validated workout could not be saved. No generated plan is available; reload before retrying.');
  }
}
