import {
  sendNotification,
  listSentNotificationsForTests,
  clearSentNotificationsForTests,
} from "../../services/notificationService";

export { listSentNotificationsForTests, clearSentNotificationsForTests };

type JobPayload = {
  user_id: number;
  title?: string;
  body: string;
  event_name?: string;
  payload?: Record<string, unknown>;
};

function mapChannel(jobChannel: string): "in_app" | "sms" | "push" {
  if (jobChannel === "in-app") return "in_app";
  return jobChannel as "sms" | "push";
}

async function runChannel(jobChannel: string, raw: Record<string, unknown>) {
  const p = raw as JobPayload;
  if (!p.user_id || !p.body) {
    throw new Error("notification_job_missing_fields");
  }
  const channel = mapChannel(jobChannel);
  return sendNotification({
    user_id: p.user_id,
    channel,
    body: p.body,
    title: p.title,
    event_name: p.event_name,
    payload: p.payload,
  });
}

export async function runPush(payload: Record<string, unknown>) {
  await runChannel("push", payload);
  return { channel: "push", ok: true };
}

export async function runSms(payload: Record<string, unknown>) {
  await runChannel("sms", payload);
  return { channel: "sms", ok: true };
}

export async function runInApp(payload: Record<string, unknown>) {
  await runChannel("in-app", payload);
  return { channel: "in-app", ok: true };
}
