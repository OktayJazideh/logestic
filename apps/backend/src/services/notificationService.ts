import { env } from "../config/env";
import { getSmsProvider, smsProviderIsStub } from "../lib/smsProvider";
import * as notificationsRepo from "../repositories/notificationsRepository";
import * as usersRepo from "../repositories/usersRepository";
import type { NotificationChannel } from "../repositories/notificationsRepository";

export type SendNotificationParams = {
  user_id: number;
  channel: NotificationChannel;
  body: string;
  title?: string;
  event_name?: string;
  payload?: Record<string, unknown>;
  mobile_number?: string;
};

const sentForTests: Array<{ channel: string; payload: Record<string, unknown>; at: string }> = [];

export function listSentNotificationsForTests() {
  return [...sentForTests];
}

export function clearSentNotificationsForTests() {
  sentForTests.length = 0;
}

/** SMS-PROD-1 — OTP delivery via configured SMS provider. Never returns code to caller. */
export async function sendOtp(mobile: string, code: string): Promise<{ ok: boolean; stub: boolean }> {
  const stub = smsProviderIsStub();
  try {
    await getSmsProvider().sendOtp(mobile, code);
    return { ok: true, stub };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notification:sms:otp] send failed", err);
    throw err;
  }
}

async function sendSmsViaProvider(mobile: string, message: string): Promise<{ ok: boolean; stub: boolean }> {
  const stub = smsProviderIsStub();
  if (stub) {
    await getSmsProvider().sendMessage(mobile, message);
    return { ok: true, stub: true };
  }

  try {
    await getSmsProvider().sendMessage(mobile, message);
    return { ok: true, stub: false };
  } catch (err) {
    throw err;
  }
}

async function deliverInApp(params: SendNotificationParams): Promise<{ notification_id: number }> {
  const row = await notificationsRepo.createNotification({
    user_id: params.user_id,
    channel: "in_app",
    body: params.body,
    title: params.title,
    event_name: params.event_name,
    payload: params.payload,
    delivery_status: "delivered",
  });
  return { notification_id: row.id };
}

async function deliverSms(params: SendNotificationParams): Promise<{ notification_id: number; stub: boolean }> {
  const user = params.mobile_number
    ? { mobile_number: params.mobile_number }
    : await usersRepo.findUserById(params.user_id);
  const mobile = user?.mobile_number;
  if (!mobile) {
    const row = await notificationsRepo.createNotification({
      user_id: params.user_id,
      channel: "sms",
      body: params.body,
      title: params.title,
      event_name: params.event_name,
      payload: params.payload,
      delivery_status: "failed_no_mobile",
    });
    return { notification_id: row.id, stub: false };
  }

  let delivery_status = "pending";
  let stub = true;
  try {
    const result = await sendSmsViaProvider(mobile, params.body);
    stub = result.stub;
    delivery_status = stub ? "stub_logged" : "sent";
  } catch (err) {
    delivery_status = "failed";
    // eslint-disable-next-line no-console
    console.error("[notification:sms] send failed", err);
  }

  const row = await notificationsRepo.createNotification({
    user_id: params.user_id,
    channel: "sms",
    body: params.body,
    title: params.title,
    event_name: params.event_name,
    payload: { ...params.payload, mobile_masked: mobile.slice(0, 4) + "****" + mobile.slice(-3) },
    delivery_status,
  });

  sentForTests.push({
    channel: "sms",
    payload: { user_id: params.user_id, body: params.body, stub, event_name: params.event_name },
    at: new Date().toISOString(),
  });

  return { notification_id: row.id, stub };
}

async function deliverPush(params: SendNotificationParams): Promise<{ notification_id: number; stub: boolean }> {
  const stub = !env.FCM_SERVER_KEY?.trim();
  if (stub) {
    // eslint-disable-next-line no-console
    console.log(
      `[notification:push:stub] user=${params.user_id} title=${params.title ?? ""} body=${params.body.slice(0, 80)}`,
    );
  } else {
    // FCM HTTP legacy — device tokens wired in a later phase
    // eslint-disable-next-line no-console
    console.log(`[notification:push] FCM key present; device token registry not wired yet`);
  }

  const row = await notificationsRepo.createNotification({
    user_id: params.user_id,
    channel: "push",
    body: params.body,
    title: params.title,
    event_name: params.event_name,
    payload: params.payload,
    delivery_status: stub ? "stub_logged" : "pending_device_token",
  });

  sentForTests.push({
    channel: "push",
    payload: { user_id: params.user_id, body: params.body, stub, event_name: params.event_name },
    at: new Date().toISOString(),
  });

  return { notification_id: row.id, stub };
}

/** NOTIF-1 — send via channel adapter respecting user preferences. */
export async function sendNotification(params: SendNotificationParams): Promise<{ ok: true; channel: NotificationChannel }> {
  const enabled = await notificationsRepo.isChannelEnabled(params.user_id, params.channel);
  if (!enabled) {
    return { ok: true, channel: params.channel };
  }

  if (params.channel === "in_app") {
    await deliverInApp(params);
  } else if (params.channel === "sms") {
    await deliverSms(params);
  } else {
    await deliverPush(params);
  }

  return { ok: true, channel: params.channel };
}

export async function sendNotificationBatch(
  items: SendNotificationParams[],
): Promise<void> {
  for (const item of items) {
    await sendNotification(item);
  }
}
