import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  let code = "";
  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({ ok: false, error: "Enter a coupon code" });
  }

  const { data, error } = await supabase.rpc("redeem_coupon", {
    coupon_code: code,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Could not redeem coupon" });
  }

  // The RPC returns { ok, error?, credits? } — relay it verbatim.
  return NextResponse.json(data);
}
