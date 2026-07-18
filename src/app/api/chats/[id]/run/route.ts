import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the latest agent run for a chat (for background/resume UX). */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("chat_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRun>();

  return NextResponse.json({ run: data ?? null });
}
