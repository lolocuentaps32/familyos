import { supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

function dateISO(d: Date) { return d.toISOString().slice(0, 10); }

function startOfWeekMonday(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

Deno.serve(async (_req) => {
  try {
    const sb = supabaseAdmin();
    const now = new Date();
    const sow = startOfWeekMonday(now);
    const eow = new Date(sow);
    eow.setUTCDate(eow.getUTCDate() + 6);

    const periodStart = dateISO(sow);
    const periodEnd = dateISO(eow);

    const { data: fms, error: fErr } = await sb
      .from("family_members")
      .select("family_id,member_id,role,status")
      .eq("status", "active")
      .in("role", ["owner", "admin", "adult"])
      .limit(2000);

    if (fErr) throw fErr;

    let created = 0;

    for (const fm of fms ?? []) {
      const { data: events, error: eErr } = await sb
        .from("events")
        .select("id,title,starts_at,ends_at,status,location")
        .eq("family_id", fm.family_id)
        .gte("starts_at", new Date(periodStart).toISOString())
        .lte("starts_at", new Date(periodEnd + "T23:59:59Z").toISOString())
        .order("starts_at", { ascending: true })
        .limit(500);

      if (eErr) throw eErr;

      const { data: tasks, error: tErr } = await sb
        .from("tasks")
        .select("id,title,status,due_at,assignee_member_id,priority")
        .eq("family_id", fm.family_id)
        .neq("status", "done")
        .order("due_at", { ascending: true })
        .limit(500);

      if (tErr) throw tErr;

      const content = {
        week_start: periodStart,
        week_end: periodEnd,
        events: events ?? [],
        tasks_open: tasks ?? [],
      };

      const { error: upErr } = await sb.from("digests").upsert({
        family_id: fm.family_id,
        member_id: fm.member_id,
        digest_type: "weekly",
        period_start: periodStart,
        period_end: periodEnd,
        content,
        status: "ready",
      }, { onConflict: "family_id,member_id,digest_type,period_start,period_end" });

      if (!upErr) created++;

      await sb.from("notification_jobs").insert({
        family_id: fm.family_id,
        member_id: fm.member_id,
        channel: "push",
        audience: "member",
        title: "Plan semanal",
        body: "Tienes el resumen de la semana listo.",
        data: { kind: "digest", digest_type: "weekly", period_start, period_end },
        scheduled_at: new Date().toISOString(),
        dedupe_key: `digest:weekly:${fm.member_id}:${periodStart}`,
      }, { defaultToNull: true });
    }

    return jsonResponse({ ok: true, periodStart, periodEnd, digests_upserted: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
