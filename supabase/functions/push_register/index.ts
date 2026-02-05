import { supabaseUser, supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json();
    const family_id = body?.family_id as string | undefined;
    const subscription = body?.subscription as unknown;

    if (!family_id || !subscription) return jsonResponse({ ok: false, error: "family_id and subscription required" }, 400);

    // user-scoped client (RLS) to get user id
    const userClient = supabaseUser(req);
    const { data: uData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !uData?.user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const user_id = uData.user.id;

    // Find member_id for this user in this family
    const { data: fm, error: fmErr } = await userClient
      .from("family_members")
      .select("member_id")
      .eq("family_id", family_id)
      .eq("auth_user_id", user_id)
      .eq("status", "active")
      .maybeSingle();

    if (fmErr) return jsonResponse({ ok: false, error: fmErr.message }, 400);
    if (!fm?.member_id) return jsonResponse({ ok: false, error: "User is not a member of this family" }, 403);

    const sb = supabaseAdmin();
    const device_name = body?.device_name ?? "browser";
    const platform = body?.platform ?? "web";

    const { error: upErr } = await sb
      .from("devices")
      .upsert({
        family_id,
        member_id: fm.member_id,
        auth_user_id: user_id,
        platform,
        device_name,
        push_token: JSON.stringify(subscription),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "family_id,auth_user_id,device_name" });

    if (upErr) return jsonResponse({ ok: false, error: upErr.message }, 400);

    return jsonResponse({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
