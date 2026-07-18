import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Idempotently credit a user for a completed Stripe payment.
 *
 * Delegates to the `grant_paid_credits` RPC (service-role only), which uses
 * insert-first idempotency against a unique index on the checkout session id —
 * concurrent webhook + confirm calls can never double-credit.
 */
export async function creditPayment(params: {
  userId: string;
  sessionId: string;
  stripeCustomerId?: string | null;
}): Promise<{ credited: boolean; credits: number | null }> {
  const { userId, sessionId, stripeCustomerId } = params;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("grant_paid_credits", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_customer_id: stripeCustomerId ?? null,
  });
  if (error) throw new Error(`grant_paid_credits failed: ${error.message}`);

  const result = data as { ok: boolean; already_credited: boolean; credits: number | null };
  return { credited: !result.already_credited, credits: result.credits ?? null };
}
