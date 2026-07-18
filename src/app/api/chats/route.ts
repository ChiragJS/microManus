import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET — list the user's chats, newest activity first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chats: data ?? [] });
}

/** POST {apiKeyId} — create a chat using the provider/model of that key. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { apiKeyId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.apiKeyId) {
    return NextResponse.json({ error: "apiKeyId is required" }, { status: 400 });
  }

  const { data: key, error: keyErr } = await supabase
    .from("api_keys")
    .select("id, provider, model")
    .eq("id", body.apiKeyId)
    .eq("user_id", user.id)
    .single();

  if (keyErr || !key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      title: "New research",
      api_key_id: key.id,
      provider: key.provider,
      model: key.model,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chat });
}
