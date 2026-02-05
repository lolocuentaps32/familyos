import webpush from "npm:web-push@3.6.7";
import { requireEnv } from "./util.ts";
import type { WebPushSubscription } from "./types.ts";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = requireEnv("VAPID_PUBLIC_KEY");
  const privateKey = requireEnv("VAPID_PRIVATE_KEY");
  const subject = requireEnv("VAPID_SUBJECT");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: Record<string, unknown>,
) {
  ensureConfigured();
  const body = JSON.stringify(payload);
  return await webpush.sendNotification(subscription as any, body);
}
