import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { creditPayment } from "@/app/api/stripe/credit";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  let sessionId = "";
  try {
    const body = await request.json();
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing session id" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ ok: false, error: "Payment not completed" });
  }
  if (session.metadata?.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Session does not belong to this user" },
      { status: 403 }
    );
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const { credits } = await creditPayment({
    userId: user.id,
    sessionId,
    stripeCustomerId: customerId,
  });

  return NextResponse.json({ ok: true, credits });
}
