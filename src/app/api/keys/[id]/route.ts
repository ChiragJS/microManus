import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return Response.json({ error: "Missing key id" }, { status: 400 });

  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
