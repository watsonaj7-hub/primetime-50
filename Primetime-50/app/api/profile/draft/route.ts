import { NextResponse } from "next/server";
import { readDraft, saveDraft } from "@/lib/services/draft";
import { checkOrigin, errorResponse, readJson } from "@/lib/http/errors";
export async function GET() {
  try { return NextResponse.json({ draft: await readDraft() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { checkOrigin(request); await saveDraft(await readJson(request)); return NextResponse.json({ saved: true }); }
  catch (error) { return errorResponse(error); }
}
