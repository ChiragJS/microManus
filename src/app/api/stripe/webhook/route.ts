import { NextResponse } from "next/server";
import Stripe from "stripe";
import { creditPayment } from "@/app/api/stripe/credit";

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature ?? "",
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (session.payment_status === "paid" && userId) {
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      try {
        await creditPayment({
          userId,
          sessionId: session.id,
          stripeCustomerId: customerId,
        });
      } catch {
        // Swallow — return 200 fast so Stripe does not retry-storm; the
        // /api/checkout/confirm fallback also credits idempotently.
      }
    }
  }

  return NextResponse.json({ received: true });
}
