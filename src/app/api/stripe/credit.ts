import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Idempotently credit a user for a completed Stripe payment.
 *
 * Idempotency: a `credit_events` row with reason='payment' and
 * metadata->>session_id = sessionId marks the session as already credited.
 * We select-then-insert; a rare double-credit race is tolerated for this app.
 */
export async function creditPayment(params: {
  userId: string;
  sessionId: string;
  stripeCustomerId?: string | null;
}): Promise<{ credited: boolean; credits: number | null }> {
  const { userId, sessionId, stripeCustomerId } = params;
  const admin = createAdminClient();

  // Already credited for this checkout session?
  const { data: existing } = await admin
    .from("credit_events")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "payment")
    .eq("metadata->>session_id", sessionId)
    .maybeSingle();

  const { data: prof } = await admin
    .from("profiles")
    .select("credits, unlock_method")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    return { credited: false, credits: prof?.credits ?? null };
  }

  const newCredits = (prof?.credits ?? 0) + 5;
  const update: Record<string, unknown> = {
    credits: newCredits,
    unlocked: true,
    unlock_method: prof?.unlock_method ?? "payment",
    updated_at: new Date().toISOString(),
  };
  if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;

  await admin.from("profiles").update(update).eq("id", userId);
  await admin.from("credit_events").insert({
    user_id: userId,
    delta: 5,
    reason: "payment",
    metadata: { session_id: sessionId },
  });

  return { credited: true, credits: newCredits };
}
