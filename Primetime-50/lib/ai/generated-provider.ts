import 'server-only';
import OpenAI from 'openai';
import { AppError } from '@/lib/http/errors';
import type { TrustedContext } from './generated-contract';
export function assertGeneratedProviderEnabled() {
  // A key is deliberately insufficient. The DB also requires an independently approved activation record.
  if (process.env.PRIMEFIT_GENERATED_PROVIDER_ENABLED !== 'approved-live-v1' || !process.env.OPENAI_API_KEY) throw new AppError(503, 'Generated workouts are disabled. Reviewed workout tracking remains available.');
}
export async function requestGeneratedSelection(context: TrustedContext, signal: AbortSignal): Promise<string> {
  assertGeneratedProviderEnabled();
  const input = JSON.stringify(context);
  if (Buffer.byteLength(input, 'utf8') > 8192) throw new Error('Context exceeds approved envelope');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 10_000 });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini', max_tokens: 2048, temperature: 0, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Select reviewed workout IDs only. Return exactly {policy_version_id,context_revision,weeks:[{sessions:[{day,catalogue_version_id}]}]}. Days are ascending integers 1-7. Obey each week rule and rest_days across week boundaries. No advice, names, nutrition, prose, extra keys or prescription changes.' },
      { role: 'user', content: input }
    ]
  }, { signal });
  if (completion.choices.length !== 1 || completion.choices[0].finish_reason !== 'stop' || !completion.choices[0].message.content || completion.choices[0].message.refusal) throw new Error('Incomplete provider output');
  return completion.choices[0].message.content;
}
