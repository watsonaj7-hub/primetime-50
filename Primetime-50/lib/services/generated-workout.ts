import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '@/lib/http/errors';
import { generateWith } from '@/lib/ai/generated-pipeline';
import { assertGeneratedProviderEnabled, requestGeneratedSelection } from '@/lib/ai/generated-provider';
import { supabaseConfig } from '@/lib/config/public';
import type { Database } from '@/lib/db/database.types';
export const generatedRequestSchema = z.object({ request_id: z.string().uuid() }).strict();
export async function generateWorkout(userId: string, id: string) {
  assertGeneratedProviderEnabled();
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new AppError(503, 'Generated workout storage is unavailable.');
  // Narrow service-only RPCs bind the identity obtained by requireUser. No caller-selected user/model/policy.
  const db = createClient<Database>(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return generateWith(id, {
    reserve: async requestId => {
      const { data, error } = await db.rpc('reserve_generated_workout', { owner_id: userId, request_id: requestId });
      if (error) throw new AppError(503, 'Generation admission could not be confirmed. No plan was created.');
      return data;
    },
    provider: requestGeneratedSelection,
    finish: async (requestId, plan) => {
      const { data, error } = await db.rpc('finish_generated_workout', { owner_id: userId, request_id: requestId, selection: plan });
      if (error || !data) throw new Error('Storage refused');
      return data;
    },
    fail: async requestId => { await db.rpc('fail_generated_workout', { owner_id: userId, request_id: requestId }); }
  });
}
