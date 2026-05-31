import { expect, test } from "@playwright/test";
import { apiBase, cleanupSettlementPeriodApi, loginApi, loginDriverForAssignment, pollJobApi, seedDemoFleet, selectWorkspace } from "./helpers/api";

const MINE_A = 1;
const MINE_B = 2;
const QTY_TONS = 10;

test.describe("uat-haul", () => {
  test("full haul cycle: seed → need → dispatch → weighbridge → monthly-close", async ({ request }) => {
    const adminToken = await loginApi(request, "09000000000");
    const employerToken = await loginApi(request, "09000000007");
    const opsToken = await loginApi(request, "09000000002");
    const coopOpToken = await loginApi(request, "09000000111");
    const coopOpMineB = await loginApi(request, "09000000112");

    await cleanupSettlementPeriodApi(request, adminToken, MINE_A);

    // 1) ADMIN seed demo — fleet + KYC for dispatch (closes demo mission for dispatch)
    await seedDemoFleet(request, adminToken, MINE_A);

    // 2) EMPLOYER need 10t
    await selectWorkspace(request, employerToken, MINE_A);
    const needRes = await request.post(`${apiBase}/api/employer/needs`, {
      headers: { Authorization: `Bearer ${employerToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: {
        village_id: 1,
        material_type: "ORE",
        quantity_tons: QTY_TONS,
        note: "uat-haul e2e",
      },
    });
    const needJson = (await needRes.json()) as {
      success?: boolean;
      data?: { need: { id: number; status: string; quantity_tons: number } };
    };
    expect(needRes.status(), JSON.stringify(needJson)).toBe(201);
    expect(needJson.success).toBe(true);
    const needId = needJson.data!.need.id;
    expect(needJson.data!.need.status).toBe("PENDING");
    expect(needJson.data!.need.quantity_tons).toBe(QTY_TONS);

    // 3) OPERATION_ADMIN dispatch
    await selectWorkspace(request, opsToken, MINE_A, { membership_kind: "OPERATIONAL" });
    const dispatch = await request.post(`${apiBase}/api/admin/needs/${needId}/dispatch`, {
      headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: {},
    });
    const dispatchJson = (await dispatch.json()) as {
      success?: boolean;
      data?: {
        need: { status: string };
        assignments: { mission_id: number; driver_id: number; quantity_tons: number }[];
      };
    };
    expect(dispatch.ok(), JSON.stringify(dispatchJson)).toBeTruthy();
    expect(dispatchJson.success).toBe(true);
    expect(dispatchJson.data!.need.status).toBe("DISPATCHED");
    const assignments = dispatchJson.data!.assignments;
    expect(assignments.length).toBeGreaterThan(0);
    const firstAssignment = assignments[0]!;
    const missionId = firstAssignment.mission_id;
    const assignedTons = assignments.reduce((s, a) => s + a.quantity_tons, 0);
    expect(assignedTons).toBe(QTY_TONS);

    const driverToken = await loginDriverForAssignment(
      request,
      adminToken,
      MINE_A,
      firstAssignment.driver_id,
    );

    // 4) COOP_OPERATOR weighbridge weights → OPERATION_ADMIN approve
    for (const step of ["ACCEPTED", "ARRIVED"] as const) {
      const body =
        step === "ARRIVED" ? { step, latitude: 27.0, longitude: 55.0 } : { step };
      const r = await request.post(`${apiBase}/api/driver/missions/${missionId}/steps`, {
        headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
        data: body,
      });
      const j = (await r.json()) as { success?: boolean };
      expect(r.ok() && j.success, `driver step ${step}`).toBeTruthy();
    }

    const ticketRes = await request.get(`${apiBase}/api/driver/missions/${missionId}/ticket`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const ticketJson = (await ticketRes.json()) as { data?: { ticket?: { id: number } } };
    const ticketId = ticketJson.data?.ticket?.id;
    expect(ticketId, "ticket after ARRIVED").toBeTruthy();

    await selectWorkspace(request, coopOpToken, MINE_A, {
      cooperativeId: 1,
      membership_kind: "COMMUNITY",
    });
    const loadedKg = 10000 + QTY_TONS * 1000;
    const weights = await request.post(`${apiBase}/api/weighbridge/tickets/${ticketId}/weights`, {
      headers: { Authorization: `Bearer ${coopOpToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: { empty_weight: 10000, loaded_weight: loadedKg },
    });
    const weightsJson = (await weights.json()) as { success?: boolean; data?: { ticket?: { status: string } } };
    expect(weights.ok() && weightsJson.success).toBeTruthy();
    expect(weightsJson.data?.ticket?.status).toBe("LOADED_REGISTERED");

    for (const step of ["LOADED", "IN_TRANSIT", "DELIVERED"] as const) {
      const body = step === "DELIVERED" ? { step, latitude: 27.05, longitude: 55.05 } : { step };
      const r = await request.post(`${apiBase}/api/driver/missions/${missionId}/steps`, {
        headers: { Authorization: `Bearer ${driverToken}`, "Idempotency-Key": crypto.randomUUID() },
        data: body,
      });
      const j = (await r.json()) as { success?: boolean };
      expect(r.ok() && j.success, `driver step ${step}`).toBeTruthy();
    }

    const crossSelect = await request.post(`${apiBase}/api/workspaces/select`, {
      headers: { Authorization: `Bearer ${coopOpMineB}` },
      data: { mine_id: MINE_A, cooperative_id: 1, membership_kind: "COMMUNITY" },
    });
    expect(crossSelect.status()).toBe(403);

    const mineBSelect = await request.post(`${apiBase}/api/workspaces/select`, {
      headers: { Authorization: `Bearer ${coopOpMineB}` },
      data: { mine_id: MINE_B, cooperative_id: 2, membership_kind: "COMMUNITY" },
    });
    if (mineBSelect.ok()) {
      const crossWeights = await request.post(`${apiBase}/api/weighbridge/tickets/${ticketId}/weights`, {
        headers: { Authorization: `Bearer ${coopOpMineB}`, "Idempotency-Key": crypto.randomUUID() },
        data: { empty_weight: 9000, loaded_weight: 14000 },
      });
      expect(crossWeights.status()).toBe(403);
    }

    await selectWorkspace(request, opsToken, MINE_A, { membership_kind: "OPERATIONAL" });
    const approve = await request.post(`${apiBase}/api/weighbridge/tickets/${ticketId}/approve`, {
      headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
    });
    const approveJson = (await approve.json()) as {
      success?: boolean;
      data?: { mission?: { status: string } };
    };
    expect(approve.ok() && approveJson.success).toBeTruthy();
    expect(approveJson.data?.mission?.status).toBe("VERIFIED");

    // 6) cross-mine isolation (before approve)
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    await selectWorkspace(request, opsToken, MINE_A, { membership_kind: "OPERATIONAL" });
    const close = await request.post(`${apiBase}/api/admin/settlement/monthly-close`, {
      headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: { mine_id: MINE_A, year, month },
    });
    const closeJson = (await close.json()) as {
      success?: boolean;
      data?: { job_id?: string; batch?: { id: number } };
    };
    expect([200, 202]).toContain(close.status());
    expect(closeJson.success).toBe(true);

    let batchId: number;
    if (close.status() === 202) {
      const jobId = closeJson.data!.job_id!;
      const job = await pollJobApi(request, jobId, opsToken);
      const result = job.result as { ok?: boolean; batch?: { id: number } };
      expect(result?.ok).toBe(true);
      batchId = result!.batch!.id;
    } else {
      batchId = closeJson.data!.batch!.id;
    }

    const batches = await request.get(`${apiBase}/api/settlement/batches`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const batchesJson = (await batches.json()) as {
      success?: boolean;
      data?: { batches: { id: number }[] };
    };
    expect(batches.ok() && batchesJson.success).toBeTruthy();
    expect(batchesJson.data!.batches.some((b) => b.id === batchId)).toBe(true);

    const exportPost = await request.post(`${apiBase}/api/admin/settlement/${batchId}/export`, {
      headers: { Authorization: `Bearer ${opsToken}`, "Idempotency-Key": crypto.randomUUID() },
      data: {},
    });
    const exportJson = (await exportPost.json()) as { success?: boolean; data?: { job_id?: string } };
    expect([200, 202]).toContain(exportPost.status());
    expect(exportJson.success).toBe(true);

    if (exportPost.status() === 202 && exportJson.data?.job_id) {
      const exportJob = await pollJobApi(request, exportJson.data.job_id, opsToken);
      expect(exportJob.status).toBe("completed");
    }

    const exportGet = await request.get(
      `${apiBase}/api/admin/settlement/${batchId}/export?sync=1&format=csv`,
      { headers: { Authorization: `Bearer ${opsToken}` } },
    );
    expect(exportGet.ok()).toBeTruthy();
    const csv = await exportGet.text();
    expect(csv.length).toBeGreaterThan(10);

    // period statement draft (post INVOICE-DRAFT / monthly-close)
    const ps = await request.get(
      `${apiBase}/api/admin/finance/period-statements?mine_id=${MINE_A}&cooperative_id=1&year=${year}&month=${month}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const psJson = (await ps.json()) as {
      success?: boolean;
      data?: { statements: unknown[] };
    };
    expect(ps.ok() && psJson.success).toBeTruthy();
    expect((psJson.data?.statements?.length ?? 0)).toBeGreaterThan(0);
  });
});
