import { NextResponse } from "next/server";
import { checkOrigin, errorResponse, readJson } from "@/lib/http/errors";
import { readProfile, saveProfile } from "@/lib/services/profile";
import { requireUser } from "@/lib/auth/require-user";

export async function GET() {
  try { return NextResponse.json({ profile: await readProfile() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    await requireUser();
    await saveProfile(await readJson(request));
    return NextResponse.json({ profile: await readProfile() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
