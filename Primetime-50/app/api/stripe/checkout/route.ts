import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

const schema = z.object({
  plan: z.enum(["pro", "premium"])
});

export async function POST(request: Request) {
  const { plan } = schema.parse(await request.json());
  const priceId = plan === "pro" ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_PREMIUM_PRICE_ID;

  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?canceled=true`
  });

  return NextResponse.json({ url: session.url });
}
