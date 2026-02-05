import { supabaseAdmin, supabaseUser } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

    const userClient = supabaseUser(req);
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json();
    const name = String(body?.name ?? "Mi Familia").trim();
    const display_name = String(body?.display_name ?? (u.user.email ?? "Owner")).trim();

    const sb = supabaseAdmin();

    // 1) family
    const { data: fam, error: fErr } = await sb
      .from("families")
      .insert({ name })
      .select("id,name")
      .single();
    if (fErr) throw fErr;

    // 2) member
    const { data: mem, error: mErr } = await sb
      .from("members")
      .insert({ family_id: fam.id, display_name })
      .select("id")
      .single();
    if (mErr) throw mErr;

    // 3) family_members
    const { error: fmErr } = await sb
      .from("family_members")
      .insert({ family_id: fam.id, member_id: mem.id, auth_user_id: u.user.id, role: "owner", status: "active" });
    if (fmErr) throw fmErr;

    return jsonResponse({ ok: true, family: fam, member_id: mem.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
