/**
 * NOTIF-1: NotificationService, preferences, EVENT-1 subscriber, GET /api/notifications.
 * Run 3x: npm run test:notif1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { appContext } from "../src/appContext";
import {
  initEventBus,
  publishEvent,
  resetEventBusForTests,
} from "../src/services/eventBus";
import { runWithEventContext } from "../src/lib/eventContext";
import { jobQueue } from "../src/queues/jobQueue";
import { wireQueueFromEventBus } from "../src/queues/wireEventBus";
import {
  clearSentNotificationsForTests,
  listSentNotificationsForTests,
} from "../src/queues/handlers/notificationJobs";
import * as notificationsRepo from "../src/repositories/notificationsRepository";
import { sendNotification } from "../src/services/notificationService";
import { toBig, toNum } from "../src/repositories/id";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function waitForJobs(maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (jobQueue.listActive().length === 0) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("jobs did not drain in time");
}

async function ensureDriverUser(run: number): Promise<{ driverEntityId: number; userId: number }> {
  const mobile = `0912000${String(run).padStart(4, "0")}`;
  const user = await appContext.userStore.upsertUserByMobile(mobile, "DRIVER", { is_active: true });
  const driver = await prisma.drivers.upsert({
    where: { user_id: toBig(user.id) },
    create: {
      user_id: toBig(user.id),
      full_name: `راننده تست ${run}`,
      status: "APPROVED",
    },
    update: { full_name: `راننده تست ${run}` },
  });
  return { driverEntityId: toNum(driver.id), userId: user.id };
}

async function ensureHouseholdUser(run: number): Promise<{ householdEntityId: number; userId: number }> {
  const mobile = `0913000${String(run).padStart(4, "0")}`;
  const user = await appContext.userStore.upsertUserByMobile(mobile, "HOUSEHOLD", { is_active: true });
  const village = await prisma.villages.findFirst();
  assert(village != null, "seed village required");
  const household = await prisma.households.upsert({
    where: { user_id: toBig(user.id) },
    create: {
      user_id: toBig(user.id),
      village_id: village.id,
      head_name: `خانوار ${run}`,
      national_id: `HN${String(run).padStart(10, "0")}`,
      status: "APPROVED",
    },
    update: { head_name: `خانوار ${run}`, status: "APPROVED" },
  });
  return { householdEntityId: toNum(household.id), userId: user.id };
}

async function testMissionAssigned(run: number) {
  const { driverEntityId, userId } = await ensureDriverUser(run);
  clearSentNotificationsForTests();

  await runWithEventContext({ correlationId: `notif1-ma-${run}`, publishedBy: 1 }, async () => {
    await publishEvent("mission.assigned", {
      mission_id: 90000 + run,
      driver_id: driverEntityId,
    });
  });

  await waitForJobs();

  const sent = listSentNotificationsForTests();
  assert(sent.some((n) => n.channel === "sms"), `run ${run}: sms not sent for mission.assigned`);
  assert(sent.some((n) => n.channel === "push"), `run ${run}: push not sent for mission.assigned`);

  const smsCount = await notificationsRepo.countNotificationsByChannel(userId, "sms");
  const pushCount = await notificationsRepo.countNotificationsByChannel(userId, "push");
  assert(smsCount >= 1, `run ${run}: sms row missing in DB`);
  assert(pushCount >= 1, `run ${run}: push row missing in DB`);
}

async function testKycHousehold(run: number) {
  const { householdEntityId, userId } = await ensureHouseholdUser(run);
  clearSentNotificationsForTests();

  await runWithEventContext({ correlationId: `notif1-kyc-${run}`, publishedBy: 1 }, async () => {
    await publishEvent("kyc.household_approved", { household_id: householdEntityId });
  });

  await waitForJobs();

  const sent = listSentNotificationsForTests();
  assert(sent.some((n) => n.channel === "sms"), `run ${run}: kyc sms missing`);

  const smsCount = await notificationsRepo.countNotificationsByChannel(userId, "sms");
  assert(smsCount >= 1, `run ${run}: kyc sms DB row missing`);
}

async function testWeighbridgeAnomaly(run: number) {
  await appContext.userStore.upsertUserByMobile("09000000002", "OPERATION_ADMIN", { is_active: true });
  clearSentNotificationsForTests();

  await runWithEventContext({ correlationId: `notif1-wb-${run}`, publishedBy: 1 }, async () => {
    await publishEvent("weighbridge.anomaly", {
      mission_id: 70000 + run,
      ticket_id: run,
    });
  });

  await waitForJobs();

  const sent = listSentNotificationsForTests();
  assert(sent.some((n) => n.channel === "sms"), `run ${run}: anomaly sms to OPERATION_ADMIN missing`);
}

async function testSettlementSettled(run: number) {
  const ownerMobile = `0914000${String(run).padStart(4, "0")}`;
  const ownerUser = await appContext.userStore.upsertUserByMobile(ownerMobile, "FLEET_OWNER", {
    is_active: true,
  });
  const owner = await prisma.fleet_owners.upsert({
    where: { user_id: toBig(ownerUser.id) },
    create: {
      user_id: toBig(ownerUser.id),
      full_name: `مالک ${run}`,
      national_id: `FO${String(run).padStart(10, "0")}`,
      status: "APPROVED",
    },
    update: {},
  });

  const hh = await ensureHouseholdUser(run + 1000);

  const ownerWallet = await prisma.wallets.create({
    data: { wallet_type: "OWNER", owner_id: owner.id },
  });
  const hhWallet = await prisma.wallets.create({
    data: { wallet_type: "HOUSEHOLD", household_id: toBig(hh.householdEntityId) },
  });

  const batch = await prisma.settlement_batches.create({
    data: {
      period_start: new Date("2099-01-01"),
      period_end: new Date("2099-01-31"),
      status: "SETTLED",
      payment_reference: `REF-NOTIF-${run}`,
    },
  });

  await prisma.settlement_lines.createMany({
    data: [
      { batch_id: batch.id, wallet_id: ownerWallet.id, amount: 850000 },
      { batch_id: batch.id, wallet_id: hhWallet.id, amount: 150000 },
    ],
  });

  clearSentNotificationsForTests();

  await runWithEventContext({ correlationId: `notif1-set-${run}`, publishedBy: 1 }, async () => {
    await publishEvent("settlement.settled", {
      batch_id: toNum(batch.id),
      payment_reference: `REF-NOTIF-${run}`,
    });
  });

  await waitForJobs();

  const ownerSms = await notificationsRepo.countNotificationsByChannel(ownerUser.id, "sms");
  const hhSms = await notificationsRepo.countNotificationsByChannel(hh.userId, "sms");
  assert(ownerSms >= 1, `run ${run}: fleet owner settlement sms missing`);
  assert(hhSms >= 1, `run ${run}: household settlement sms missing`);

  const ownerRow = await prisma.notifications.findFirst({
    where: { user_id: toBig(ownerUser.id), channel: "sms", event_name: "settlement.settled" },
    orderBy: { created_at: "desc" },
  });
  assert(ownerRow?.body.includes(`REF-NOTIF-${run}`), `run ${run}: payment_reference not in SMS body`);

  await prisma.settlement_lines.deleteMany({ where: { batch_id: batch.id } });
  await prisma.settlement_batches.delete({ where: { id: batch.id } });
  await prisma.wallets.delete({ where: { id: ownerWallet.id } });
  await prisma.wallets.delete({ where: { id: hhWallet.id } });
}

async function testInAppAndPreferences(run: number) {
  const mobile = `0915000${String(run).padStart(4, "0")}`;
  const user = await appContext.userStore.upsertUserByMobile(mobile, "DRIVER", { is_active: true });

  await sendNotification({
    user_id: user.id,
    channel: "in_app",
    title: "تست",
    body: `پیام in-app ${run}`,
    event_name: "test.in_app",
  });

  const items = await notificationsRepo.listNotificationsForUser({
    user_id: user.id,
    channel: "in_app",
  });
  assert(items.some((n) => n.body.includes(`in-app ${run}`)), `run ${run}: in_app list missing`);

  await notificationsRepo.upsertNotificationPreferences(user.id, { sms: false });
  clearSentNotificationsForTests();
  await sendNotification({
    user_id: user.id,
    channel: "sms",
    body: "should be skipped",
    event_name: "test.prefs",
  });
  const sent = listSentNotificationsForTests();
  assert(sent.length === 0, `run ${run}: sms should be skipped when preference off`);

  await notificationsRepo.upsertNotificationPreferences(user.id, { sms: true });
}

async function runOnce(run: number) {
  resetEventBusForTests();
  jobQueue.resetForTests();
  clearSentNotificationsForTests();

  initEventBus(appContext.auditStore);
  wireQueueFromEventBus();

  await testInAppAndPreferences(run);
  await testMissionAssigned(run);
  await testKycHousehold(run);
  await testWeighbridgeAnomaly(run);
  await testSettlementSettled(run);

  console.log(`NOTIF-1 run ${run}: OK`);
}

async function main() {
  for (let run = 1; run <= 3; run++) {
    await runOnce(run);
  }
  console.log("test:notif1 — all 3 runs passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
