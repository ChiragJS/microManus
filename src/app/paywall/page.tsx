import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
