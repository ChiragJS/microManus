import { redirect } from "next/navigation";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { creditPayment } from "@/app/api/stripe/credit";
import { PaywallClient } from "@/components/auth/paywall-client";

export default async function PaywallPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    session_id?: string;
    canceled?: string;
  }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware protects /paywall, but guard defensively.
  if (!user) redirect("/login?next=/paywall");

  // Returning from Stripe: confirm + credit server-side, then land straight on
  // /chat — the user should never see the paywall again after paying.
  // (Idempotent with the webhook; whichever runs first wins.)
  if (params.success === "1" && params.session_id) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(params.session_id);
      if (
        session.payment_status === "paid" &&
        session.metadata?.userId === user.id
      ) {
        await creditPayment({
          userId: user.id,
          sessionId: session.id,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
        });
        redirect("/chat");
      }
    } catch (err) {
      // Next's redirect() throws internally — always rethrow it.
      if (err && typeof err === "object" && "digest" in err) throw err;
      // Stripe/network hiccup: fall through to the client confirm/poll flow.
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, unlocked, coupon_redeemed, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <PaywallClient
      initialCredits={profile?.credits ?? 0}
      initialUnlocked={profile?.unlocked ?? false}
      couponRedeemed={profile?.coupon_redeemed ?? false}
      email={profile?.email ?? user.email ?? null}
      success={params.success === "1"}
      sessionId={params.session_id ?? null}
      canceled={params.canceled === "1"}
    />
  );
}
