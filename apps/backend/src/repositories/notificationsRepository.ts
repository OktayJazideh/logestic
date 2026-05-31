import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";

export type NotificationChannel = "in_app" | "sms" | "push";

export type NotificationRow = {
  id: number;
  user_id: number;
  channel: NotificationChannel;
  event_name?: string;
  title?: string;
  body: string;
  payload?: Record<string, unknown>;
  delivery_status: string;
  read_at?: Date;
  created_at: Date;
};

export type NotificationPreferencesRow = {
  user_id: number;
  in_app: boolean;
  sms: boolean;
  push: boolean;
};

type Tx = Prisma.TransactionClient;

function mapNotification(r: {
  id: bigint;
  user_id: bigint;
  channel: string;
  event_name: string | null;
  title: string | null;
  body: string;
  payload: unknown;
  delivery_status: string;
  read_at: Date | null;
  created_at: Date;
}): NotificationRow {
  return {
    id: toNum(r.id),
    user_id: toNum(r.user_id),
    channel: r.channel as NotificationChannel,
    event_name: r.event_name ?? undefined,
    title: r.title ?? undefined,
    body: r.body,
    payload: r.payload != null ? (r.payload as Record<string, unknown>) : undefined,
    delivery_status: r.delivery_status,
    read_at: r.read_at ?? undefined,
    created_at: r.created_at,
  };
}

export async function createNotification(
  params: {
    user_id: number;
    channel: NotificationChannel;
    body: string;
    event_name?: string;
    title?: string;
    payload?: Record<string, unknown>;
    delivery_status?: string;
  },
  tx?: Tx,
): Promise<NotificationRow> {
  const db = tx ?? prisma;
  const row = await db.notifications.create({
    data: {
      user_id: toBig(params.user_id),
      channel: params.channel,
      event_name: params.event_name,
      title: params.title,
      body: params.body,
      payload: params.payload as object | undefined,
      delivery_status: params.delivery_status ?? "pending",
    },
  });
  return mapNotification(row);
}

export async function updateNotificationDeliveryStatus(
  id: number,
  delivery_status: string,
  tx?: Tx,
): Promise<void> {
  const db = tx ?? prisma;
  await db.notifications.update({
    where: { id: toBig(id) },
    data: { delivery_status },
  });
}

export async function listNotificationsForUser(params: {
  user_id: number;
  channel?: NotificationChannel;
  unread_only?: boolean;
  limit?: number;
}): Promise<NotificationRow[]> {
  const rows = await prisma.notifications.findMany({
    where: {
      user_id: toBig(params.user_id),
      channel: params.channel ?? (params.unread_only ? "in_app" : undefined),
      ...(params.unread_only ? { read_at: null } : {}),
    },
    orderBy: { created_at: "desc" },
    take: params.limit ?? 50,
  });
  return rows.map(mapNotification);
}

export async function getNotificationPreferences(user_id: number): Promise<NotificationPreferencesRow> {
  const row = await prisma.notification_preferences.findUnique({ where: { user_id: toBig(user_id) } });
  if (row) {
    return {
      user_id: toNum(row.user_id),
      in_app: row.in_app,
      sms: row.sms,
      push: row.push,
    };
  }
  return { user_id, in_app: true, sms: true, push: true };
}

export async function isChannelEnabled(user_id: number, channel: NotificationChannel): Promise<boolean> {
  const prefs = await getNotificationPreferences(user_id);
  if (channel === "in_app") return prefs.in_app;
  if (channel === "sms") return prefs.sms;
  return prefs.push;
}

export async function upsertNotificationPreferences(
  user_id: number,
  patch: Partial<Pick<NotificationPreferencesRow, "in_app" | "sms" | "push">>,
): Promise<NotificationPreferencesRow> {
  const row = await prisma.notification_preferences.upsert({
    where: { user_id: toBig(user_id) },
    create: {
      user_id: toBig(user_id),
      in_app: patch.in_app ?? true,
      sms: patch.sms ?? true,
      push: patch.push ?? true,
    },
    update: {
      ...(patch.in_app !== undefined ? { in_app: patch.in_app } : {}),
      ...(patch.sms !== undefined ? { sms: patch.sms } : {}),
      ...(patch.push !== undefined ? { push: patch.push } : {}),
    },
  });
  return {
    user_id: toNum(row.user_id),
    in_app: row.in_app,
    sms: row.sms,
    push: row.push,
  };
}

export async function deleteAllNotificationsForTests(): Promise<void> {
  await prisma.notifications.deleteMany();
  await prisma.notification_preferences.deleteMany();
}

export async function countNotificationsByChannel(
  user_id: number,
  channel: NotificationChannel,
): Promise<number> {
  return prisma.notifications.count({
    where: { user_id: toBig(user_id), channel },
  });
}
