import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Chat, ApiKeyRow, MessageRow } from "@/lib/types";
import ChatWorkspace from "@/components/chat/ChatWorkspace";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<Chat>();
  if (!chat) notFound();

  const [{ data: chats }, { data: messages }, { data: apiKeys }, { data: profile }] =
    await Promise.all([
      supabase
        .from("chats")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true }),
      supabase
        .from("api_keys")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("credits").eq("id", user.id).single(),
    ]);

  return (
    <ChatWorkspace
      chats={(chats ?? []) as Chat[]}
      apiKeys={(apiKeys ?? []) as ApiKeyRow[]}
      credits={profile?.credits ?? 0}
      activeChat={chat}
      initialMessages={(messages ?? []) as MessageRow[]}
    />
  );
}
