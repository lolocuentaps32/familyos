import { supabaseAdmin } from "../_shared/supabase.ts";
import { jsonResponse, safeJsonParse, nowIso } from "../_shared/util.ts";
import type { NotificationJob, WebPushSubscription } from "../_shared/types.ts";
import { sendWebPush } from "../_shared/webpush.ts";

const BATCH_SIZE = 50;

async function lockJobs(sb: ReturnType<typeof supabaseAdmin>) {
  const now = new Date().toISOString();

  const { data: jobs, error } = await sb
    .from("notification_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw error;
  if (!jobs || jobs.length === 0) return [] as NotificationJob[];

  const ids = jobs.map((j) => j.id);
  const { error: upErr } = await sb
    .from("notification_jobs")
    .update({ status: "sending", locked_at: now, locked_by: "notify_dispatch" })
    .in("id", ids)
    .eq("status", "queued");

  if (upErr) throw upErr;
  return jobs as NotificationJob[];
}

async function resolveTargetDeviceSubs(
  sb: ReturnType<typeof supabaseAdmin>,
  job: NotificationJob,
) {
  if (job.member_id) {
    const { data, error } = await sb
      .from("devices")
      .select("push_token")
      .eq("family_id", job.family_id)
      .eq("member_id", job.member_id)
      .not("push_token", "is", null);

    if (error) throw error;
    return (data ?? [])
      .map((r) => (typeof r.push_token === "string" ? safeJsonParse<WebPushSubscription>(r.push_token) : null))
      .filter((x): x is WebPushSubscription => !!x);
  }

  let roles: string[] = [];
  if (job.audience === "admins") roles = ["owner", "admin"];
  else if (job.audience === "adults") roles = ["owner", "admin", "adult"];
  else if (job.audience === "family") roles = ["owner", "admin", "adult", "child"];
  else roles = ["owner", "admin", "adult"];

  const { data: memberIds, error: mErr } = await sb
    .from("family_members")
    .select("member_id")
    .eq("family_id", job.family_id)
    .in("role", roles)
    .eq("status", "active");

  if (mErr) throw mErr;

  const ids = (memberIds ?? []).map((x) => x.member_id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: devs, error: dErr } = await sb
    .from("devices")
    .select("push_token")
    .eq("family_id", job.family_id)
    .in("member_id", ids)
    .not("push_token", "is", null);

  if (dErr) throw dErr;

  return (devs ?? [])
    .map((r) => (typeof r.push_token === "string" ? safeJsonParse<WebPushSubscription>(r.push_token) : null))
    .filter((x): x is WebPushSubscription => !!x);
}

async function markJob(
  sb: ReturnType<typeof supabaseAdmin>,
  id: string,
  patch: Record<string, unknown>,
) {
  const { error } = await sb.from("notification_jobs").update(patch).eq("id", id);
  if (error) throw error;
}

Deno.serve(async (_req) => {
  try {
    const sb = supabaseAdmin();
    const jobs = await lockJobs(sb);

    const results: Array<{ id: string; ok: boolean; sent: number; error?: string }> = [];

    for (const job of jobs) {
      try {
        if (job.channel !== "push") {
          await markJob(sb, job.id, {
            status: "failed",
            last_error: "Only push implemented in this skeleton",
            attempts: (job.attempts ?? 0) + 1,
            updated_at: nowIso(),
          });
          results.push({ id: job.id, ok: false, sent: 0, error: "Only push implemented" });
          continue;
        }

        const subs = await resolveTargetDeviceSubs(sb, job);
        let sent = 0;

        for (const sub of subs) {
          await sendWebPush(sub, {
            title: job.title,
            body: job.body,
            data: job.data ?? {},
          });
          sent++;
        }

        await markJob(sb, job.id, {
          status: "sent",
          sent_at: nowIso(),
          updated_at: nowIso(),
        });

        results.push({ id: job.id, ok: true, sent });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const nextAttempts = (job.attempts ?? 0) + 1;
        const failed = nextAttempts >= (job.max_attempts ?? 5);

        await markJob(sb, job.id, {
          status: failed ? "failed" : "queued",
          attempts: nextAttempts,
          last_error: errMsg,
          locked_at: null,
          locked_by: null,
          updated_at: nowIso(),
        });

        results.push({ id: job.id, ok: false, sent: 0, error: errMsg });
      }
    }

    return jsonResponse({ ok: true, processed: jobs.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
