import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { PROVIDERS, getModel, type Provider } from "@/lib/pricing";

const SAFE_COLUMNS = "id, provider, base_url, model, label, created_at";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_keys")
    .select(SAFE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keys: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    label?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as Provider | undefined;
  const model = body.model?.trim();
  const apiKey = body.apiKey?.trim();
  const label = body.label?.trim() || null;

  if (!provider || !(provider in PROVIDERS)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }
  // Known providers have fixed endpoints — the client never chooses them.
  // Only "custom" takes a user-supplied URL.
  const baseUrl =
    provider === "custom" ? body.baseUrl?.trim() : PROVIDERS[provider].baseUrl;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    return Response.json({ error: "Base URL is required" }, { status: 400 });
  }
  if (!model) {
    return Response.json({ error: "Model is required" }, { status: 400 });
  }
  if (provider !== "custom" && !getModel(model)) {
    return Response.json({ error: "Unknown model" }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  let apiKeyEncrypted: string;
  try {
    apiKeyEncrypted = encrypt(apiKey);
  } catch {
    return Response.json(
      { error: "Server encryption is not configured" },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      provider,
      base_url: baseUrl,
      api_key_encrypted: apiKeyEncrypted,
      model,
      label,
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ key: data }, { status: 201 });
}
