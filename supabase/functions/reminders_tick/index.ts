import { supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/util.ts";

function isoPlusMinutes(min: number) {
  return new Date(Date.now() + min * 60_000).toISOString();
}

Deno.serve(async (_req) => {
  try {
    const sb = supabaseAdmin();
    const now = new Date().toISOString();
    const in30 = isoPlusMinutes(30);

    const { data: events, error: eErr } = await sb
      .from("events")
      .select("id,family_id,title,starts_at,ends_at,status")
      .eq("status", "confirmed")
      .gte("starts_at", now)
      .lte("starts_at", in30)
      .limit(500);

    if (eErr) throw eErr;

    if (events?.length) {
      const jobs = events.map((e) => ({
        family_id: e.family_id,
        member_id: null,
        channel: "push",
        audience: "family",
        title: "Próximo evento",
        body: `${e.title} en menos de 30 min`,
        data: { kind: "event", event_id: e.id },
        scheduled_at: now,
        dedupe_key: `event:${e.id}:t-30m`,
      }));

      await sb.from("notification_jobs").insert(jobs, { defaultToNull: true });
    }

    const { data: tasks, error: tErr } = await sb
      .from("tasks")
      .select("id,family_id,title,assignee_member_id,due_at,status")
      .neq("status", "done")
      .not("due_at", "is", null)
      .lte("due_at", now)
      .limit(500);

    if (tErr) throw tErr;

    if (tasks?.length) {
      const jobs = tasks
        .filter((t) => t.assignee_member_id)
        .map((t) => ({
          family_id: t.family_id,
          member_id: t.assignee_member_id,
          channel: "push",
          audience: "member",
          title: "Tarea vencida",
          body: t.title,
          data: { kind: "task", task_id: t.id },
          scheduled_at: now,
          dedupe_key: `task:${t.id}:overdue`,
        }));

      await sb.from("notification_jobs").insert(jobs, { defaultToNull: true });
    }

    return jsonResponse({ ok: true, events: events?.length ?? 0, tasks: tasks?.length ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
