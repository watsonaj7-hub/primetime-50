import { requireUser } from "@/lib/auth/require-user";
import { NextResponse } from "next/server";
import { readWorkouts, saveWorkout, startWorkout } from "@/lib/services/workout";
import { checkOrigin, errorResponse, readJson } from "@/lib/http/errors";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try { return NextResponse.json({ workouts: await readWorkouts(new URL(request.url).searchParams.get("id")) }, { headers }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { checkOrigin(request); await requireUser(); return NextResponse.json({ workout: await startWorkout(await readJson(request)) }, { headers }); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { checkOrigin(request); await requireUser(); return NextResponse.json({ workout: await saveWorkout(await readJson(request)) }, { headers }); }
  catch (error) { return errorResponse(error); }
}
