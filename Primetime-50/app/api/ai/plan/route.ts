import { z } from 'zod';
import { AppError } from '@/lib/http/errors';
import { readGeneratedWorkouts } from '@/lib/services/generated-workout';
import { readProgressionStatus } from '@/lib/services/progression';
const generatedReadSchema = z.object({ request_id: z.string().uuid().optional() }).strict();
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
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = generatedReadSchema.parse(Object.fromEntries(params));
    if ([...params.keys()].length !== new Set(params.keys()).size) throw new AppError(422, 'Use one request identity.');
    const plans = await readGeneratedWorkouts(input.request_id);
    return NextResponse.json({ plans, progression: await readProgressionStatus() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
