import 'server-only';
import { requireUser } from '@/lib/auth/require-user';
import { checkOrigin, errorResponse, readJson } from '@/lib/http/errors';
import { NextResponse } from 'next/server';
import { generatedRequestSchema, generateWorkout } from '@/lib/services/generated-workout';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requireUser();
    const input = generatedRequestSchema.parse(await readJson(request, 1024));
    const plan = await generateWorkout(user.id, input.request_id);
    return NextResponse.json({ plan }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
