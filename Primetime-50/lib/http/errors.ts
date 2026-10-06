import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Please check your entries.", fields: error.flatten().fieldErrors }, { status: 422 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 503 });
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin) throw new AppError(403, "Request origin is not allowed.");
}

export async function readJson(request: Request, limit = 16_384): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Send JSON with the application/json content type.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Send valid JSON.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AppError(413, "The request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
