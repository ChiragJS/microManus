import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST — request a graceful stop of the chat's running agent run. */
export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("agent_runs")
    .update({ status: "stopped", updated_at: new Date().toISOString() })
    .eq("chat_id", id)
    .eq("user_id", user.id)
    .eq("status", "running");

  return NextResponse.json({ ok: true });
}
