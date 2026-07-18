import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, unlocked, coupon_redeemed, email")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    credits: profile?.credits ?? 0,
    unlocked: profile?.unlocked ?? false,
    coupon_redeemed: profile?.coupon_redeemed ?? false,
    email: profile?.email ?? user.email ?? null,
  });
}
