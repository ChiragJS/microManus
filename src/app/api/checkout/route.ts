import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Embedded Checkout: rendered in an in-app modal; Stripe redirects to
  // return_url when payment completes. The modal's X simply unmounts it.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 500,
          product_data: {
            name: "MicroManus — 5 research credits",
          },
        },
      },
    ],
    metadata: { userId: user.id },
    payment_intent_data: {
      metadata: { userId: user.id },
    },
    return_url: `${siteUrl}/paywall?success=1&session_id={CHECKOUT_SESSION_ID}`,
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
