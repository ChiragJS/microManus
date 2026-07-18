import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Chat, ApiKeyRow } from "@/lib/types";
import ChatWorkspace from "@/components/chat/ChatWorkspace";

export const dynamic = "force-dynamic";

export default async function ChatIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: chats } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (chats && chats.length > 0) {
    redirect(`/chat/${chats[0].id}`);
  }

  const [{ data: apiKeys }, { data: profile }] = await Promise.all([
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
      activeChat={null}
      initialMessages={[]}
    />
  );
}
