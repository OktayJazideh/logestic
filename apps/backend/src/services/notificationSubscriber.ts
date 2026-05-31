import { prisma } from "../db/prisma";
import { jobQueue } from "../queues/jobQueue";
import type { DomainEvent } from "./eventBus";
import { toNum } from "../repositories/id";

type NotificationJobPayload = {
  user_id: number;
  channel: "push" | "sms" | "in-app";
  title?: string;
  body: string;
  event_name: string;
  payload?: Record<string, unknown>;
};

async function enqueueNotifications(
  items: NotificationJobPayload[],
  correlation_id?: string,
): Promise<void> {
  for (const item of items) {
    await jobQueue.enqueue(
      "notification",
      item.channel,
      {
        user_id: item.user_id,
        title: item.title,
        body: item.body,
        event_name: item.event_name,
        payload: item.payload,
      },
      { correlation_id },
    );
  }
}

async function driverUserId(driverEntityId: number): Promise<number | null> {
  const row = await prisma.drivers.findUnique({
    where: { id: BigInt(driverEntityId) },
    select: { user_id: true },
  });
  return row ? toNum(row.user_id) : null;
}

async function householdUserId(householdEntityId: number): Promise<number | null> {
  const row = await prisma.households.findUnique({
    where: { id: BigInt(householdEntityId) },
    select: { user_id: true },
  });
  return row ? toNum(row.user_id) : null;
}

async function operationAdminUserIds(): Promise<number[]> {
  const rows = await prisma.users.findMany({
    where: { role: "OPERATION_ADMIN", is_active: true },
    select: { id: true },
  });
  return rows.map((r) => toNum(r.id));
}

async function settlementSmsRecipients(
  batchId: number,
  payment_reference: string,
): Promise<NotificationJobPayload[]> {
  const lines = await prisma.settlement_lines.findMany({
    where: { batch_id: BigInt(batchId) },
    include: {
      wallet: {
        include: {
          owner: { select: { user_id: true, full_name: true } },
          household: { select: { user_id: true, head_name: true } },
        },
      },
    },
  });

  const totals = new Map<number, { amount: number; label: string }>();

  for (const line of lines) {
    const amount = Number(line.amount);
    if (line.wallet.owner) {
      const uid = toNum(line.wallet.owner.user_id);
      const prev = totals.get(uid);
      totals.set(uid, {
        amount: (prev?.amount ?? 0) + amount,
        label: line.wallet.owner.full_name,
      });
    }
    if (line.wallet.household) {
      const uid = toNum(line.wallet.household.user_id);
      const prev = totals.get(uid);
      totals.set(uid, {
        amount: (prev?.amount ?? 0) + amount,
        label: line.wallet.household.head_name,
      });
    }
  }

  const jobs: NotificationJobPayload[] = [];
  for (const [user_id, { amount, label }] of totals) {
    jobs.push({
      user_id,
      channel: "sms",
      event_name: "settlement.settled",
      title: "تسویه انجام شد",
      body: `${label}: مبلغ ${amount.toLocaleString("fa-IR")} ریال — مرجع پرداخت: ${payment_reference}`,
      payload: { batch_id: batchId, amount, payment_reference },
    });
  }
  return jobs;
}

async function handleMissionAssigned(event: DomainEvent): Promise<void> {
  const driver_id = event.payload.driver_id;
  if (driver_id == null) return;
  const userId = await driverUserId(Number(driver_id));
  if (!userId) return;

  const mission_id = event.payload.mission_id;
  const body = `ماموریت جدید #${mission_id} به شما اختصاص یافت. لطفاً در اپ راننده بررسی کنید.`;

  await enqueueNotifications(
    [
      {
        user_id: userId,
        channel: "sms",
        event_name: event.event_name,
        title: "ماموریت جدید",
        body,
        payload: event.payload,
      },
      {
        user_id: userId,
        channel: "push",
        event_name: event.event_name,
        title: "ماموریت جدید",
        body,
        payload: event.payload,
      },
    ],
    event.correlation_id,
  );
}

async function handleSettlementSettled(event: DomainEvent): Promise<void> {
  const batch_id = event.payload.batch_id;
  const payment_reference = String(event.payload.payment_reference ?? "");
  if (batch_id == null || !payment_reference) return;

  const jobs = await settlementSmsRecipients(Number(batch_id), payment_reference);
  await enqueueNotifications(jobs, event.correlation_id);
}

async function handleWeighbridgeAnomaly(event: DomainEvent): Promise<void> {
  const adminIds = await operationAdminUserIds();
  const mission_id = event.payload.mission_id;
  const body = `هشدار باسکول: انحراف وزن در ماموریت #${mission_id}. لطفاً در پنل عملیات بررسی کنید.`;

  await enqueueNotifications(
    adminIds.map((user_id) => ({
      user_id,
      channel: "sms" as const,
      event_name: event.event_name,
      title: "ناهنجاری باسکول",
      body,
      payload: event.payload,
    })),
    event.correlation_id,
  );
}

async function handleKycHouseholdApproved(event: DomainEvent): Promise<void> {
  const household_id = event.payload.household_id;
  if (household_id == null) return;
  const userId = await householdUserId(Number(household_id));
  if (!userId) return;

  await enqueueNotifications(
    [
      {
        user_id: userId,
        channel: "sms",
        event_name: event.event_name,
        title: "تأیید عضویت",
        body: "درخواست عضویت خانوار شما تأیید شد. می‌توانید از پنل تعاونی استفاده کنید.",
        payload: event.payload,
      },
    ],
    event.correlation_id,
  );
}

/** NOTIF-1 — map domain events to notification queue jobs. */
export async function handleDomainEventNotification(event: DomainEvent): Promise<void> {
  switch (event.event_name) {
    case "mission.assigned":
      await handleMissionAssigned(event);
      break;
    case "settlement.settled":
      await handleSettlementSettled(event);
      break;
    case "weighbridge.anomaly":
      await handleWeighbridgeAnomaly(event);
      break;
    case "kyc.household_approved":
      await handleKycHouseholdApproved(event);
      break;
    default:
      break;
  }
}
