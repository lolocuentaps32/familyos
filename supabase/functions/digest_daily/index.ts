import { supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

function toDateOnlyISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
  try {
    const sb = supabaseAdmin();
    const today = toDateOnlyISO(new Date());

    const { data: fms, error: fErr } = await sb
      .from("family_members")
      .select("family_id,member_id,role,status")
      .eq("status", "active")
      .in("role", ["owner", "admin", "adult", "child"])
      .limit(2000);

    if (fErr) throw fErr;

    let created = 0;

    for (const fm of fms ?? []) {
      const { data: digestData, error: dErr } = await sb
        .rpc("build_daily_digest", {
          _family_id: fm.family_id,
          _member_id: fm.member_id,
          _day: today,
        });

      if (dErr) throw dErr;

      const { error: upErr } = await sb.from("digests").upsert({
        family_id: fm.family_id,
        member_id: fm.member_id,
        digest_type: "daily",
        period_start: today,
        period_end: today,
        content: digestData,
        status: "ready",
      }, { onConflict: "family_id,member_id,digest_type,period_start,period_end" });

      if (!upErr) created++;

      await sb.from("notification_jobs").insert({
        family_id: fm.family_id,
        member_id: fm.member_id,
        channel: "push",
        audience: "member",
        title: "Resumen de hoy",
        body: "Tienes tu plan del día listo.",
        data: { kind: "digest", digest_type: "daily", day: today },
        scheduled_at: new Date().toISOString(),
        dedupe_key: `digest:daily:${fm.member_id}:${today}`,
      }, { defaultToNull: true });
    }

    return jsonResponse({ ok: true, day: today, digests_upserted: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
