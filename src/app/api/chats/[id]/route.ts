import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET — a chat plus its user/assistant messages for display. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: chat, error: chatErr } = await supabase
    .from("chats")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (chatErr || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ chat, messages: messages ?? [] });
}

/** DELETE — remove a chat (cascades to messages). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("chats")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH {title} — rename a chat. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const { data: chat, error } = await supabase
    .from("chats")
    .update({ title: title.slice(0, 120) })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chat });
}
