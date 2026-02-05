import { supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

function isoPlusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (_req) => {
  try {
    const sb = supabaseAdmin();
    const windowStart = new Date().toISOString();
    const windowEnd = isoPlusDays(14);

    const { data: fms, error: fErr } = await sb
      .from("family_members")
      .select("family_id,member_id,status")
      .eq("status", "active")
      .limit(5000);

    if (fErr) throw fErr;

    let total = 0;

    for (const fm of fms ?? []) {
      const { data, error } = await sb.rpc("refresh_event_conflicts_for_member", {
        _family_id: fm.family_id,
        _member_id: fm.member_id,
        _window_start: windowStart,
        _window_end: windowEnd,
      });
      if (error) throw error;
      total += Number(data ?? 0);
    }

    return jsonResponse({ ok: true, windowStart, windowEnd, conflicts_inserted: total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
