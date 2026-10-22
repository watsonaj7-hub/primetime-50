import { requireUser } from "@/lib/auth/require-user";
import { NextResponse } from "next/server";
import { completeWorkout } from "@/lib/services/workout";
import { checkOrigin, errorResponse, readJson } from "@/lib/http/errors";
export async function POST(request: Request) {
  try { checkOrigin(request); await requireUser(); return NextResponse.json({ workout: await completeWorkout(await readJson(request)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
