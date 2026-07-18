import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ApiKeyRow, Profile } from "@/lib/types";
import TopNav from "@/components/settings/TopNav";
import AddKeyForm from "@/components/settings/AddKeyForm";
import KeyList from "@/components/settings/KeyList";

export const dynamic = "force-dynamic";

type SafeKey = Pick<
  ApiKeyRow,
  "id" | "provider" | "base_url" | "model" | "label" | "created_at"
>;

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: keys }, { data: profile }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, provider, base_url, model, label, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("credits").eq("id", user.id).single(),
  ]);

  const credits = (profile as Pick<Profile, "credits"> | null)?.credits ?? 0;

  return (
    <div className="min-h-full">
      <TopNav credits={credits} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-lg font-medium tracking-tight text-ink">API Keys</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Bring your own LLM keys. Keys are encrypted at rest and never leave the
          server in plaintext.
        </p>

        <section className="mt-6">
          <AddKeyForm />
        </section>

        <section className="mt-8">
          <KeyList keys={(keys as SafeKey[] | null) ?? []} />
        </section>
      </main>
    </div>
  );
}
