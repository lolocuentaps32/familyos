export type WebPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type NotificationJob = {
  id: string;
  family_id: string;
  member_id: string | null;
  channel: "push" | "email";
  audience: "member" | "adults" | "family" | "admins";
  title: string;
  body: string;
  data: Record<string, unknown>;
  scheduled_at: string;
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
};
