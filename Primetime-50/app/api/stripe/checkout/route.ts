import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { checkOrigin, errorResponse, readJson, AppError } from "@/lib/http/errors";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

const schema = z.object({
  plan: z.enum(["pro", "premium"])
});

export async function POST(request: Request) {
  try {
  checkOrigin(request);
  const { user } = await requireUser();
  const { plan } = schema.parse(await readJson(request));
  const priceId = plan === "pro" ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_PREMIUM_PRICE_ID;

  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) throw new AppError(503, "Checkout is unavailable. Please try again later.");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?canceled=true`
  });

  return NextResponse.json({ url: session.url });
  } catch (error) { return errorResponse(error); }
}
