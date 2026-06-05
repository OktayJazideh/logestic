import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { env } from "../config/env";
import { success, failure } from "../http/apiResponse";
import { requireRoles } from "../middleware/rbac";
import { authMiddleware } from "../middleware/authMiddleware";
import { resolveAuthContext } from "../lib/authContext";
import { ACTIVE_MISSION_STATUSES } from "../lib/missionFsm";
import { prisma } from "../db/prisma";
import * as workspaceRepo from "../repositories/workspaceMembershipsRepository";
import { toNum } from "../repositories/id";
import { UserRoles, type UserRole } from "../types/userRole";
import { nationalIdFromSeed } from "../lib/nationalId";

const router = Router();

const requireAuth = authMiddleware(resolveAuthContext);

/** Disabled in production (DEPLOY-SAHMAN-1). */
router.use((req, res, next) => {
  if (env.NODE_ENV === "production") {
    const requestId = (req as { requestId?: string }).requestId;
    return res.status(404).json(failure("not_found", "Not found", undefined, requestId));
  }
  next();
});

router.post("/__dev/seed/demo", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as any).requestId as string | undefined;
  try {
    const body = z
      .object({
        mine_id: z.number().int().positive().optional().default(1),
        quantity_tons: z.number().positive().optional().default(5),
        material_type: z.string().min(1).optional().default("ORE"),
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        success: false,
        error: { code: "invalid_request", message: "Invalid input", details: body.error.flatten(), requestId },
      });
    }

    const mineId = body.data.mine_id;

    const existingMine = appContext.mineData.getMine(mineId);
    if (!existingMine) {
      return res.status(404).json({ success: false, error: { code: "mine_not_found", message: "Mine not found", requestId } });
    }

    const seedNational = (mobile: string) => nationalIdFromSeed(mobile.slice(-9));
    const admin = await appContext.userStore.upsertUserByMobile("09000000000", "ADMIN", {
      is_active: true,
    });
    await appContext.userStore.upsertUserByMobile("09000000001", "COOP_ADMIN", {
      is_active: true,
      cooperative_id: 1,
      national_id: seedNational("09000000001"),
    });
    await appContext.userStore.upsertUserByMobile("09000000002", "OPERATION_ADMIN", {
      is_active: true,
      national_id: seedNational("09000000002"),
    });
    const driverUser = await appContext.userStore.upsertUserByMobile("09000000003", "DRIVER", {
      is_active: true,
      national_id: seedNational("09000000003"),
    });
    const fleetOwnerUser = await appContext.userStore.upsertUserByMobile("09000000004", "FLEET_OWNER", {
      is_active: true,
      national_id: seedNational("09000000004"),
    });
    const householdUser = await appContext.userStore.upsertUserByMobile("09000000005", "HOUSEHOLD", {
      is_active: true,
      national_id: seedNational("09000000005"),
    });
    const consultantUser = await appContext.userStore.upsertUserByMobile("09000000006", "CONSULTANT", {
      is_active: true,
      national_id: seedNational("09000000006"),
    });
    await appContext.userStore.upsertUserByMobile("09000000007", "EMPLOYER", {
      is_active: true,
      national_id: seedNational("09000000007"),
    });

    const villages = appContext.mineData.listVillagesByMine(mineId);
    const villageId = villages[0]?.id;
    if (!villageId) {
      return res.status(400).json({ success: false, error: { code: "no_villages", message: "Missing villages for mine", requestId } });
    }

    const household = await appContext.entities.upsertHousehold({
      user_id: householdUser.id,
      village_id: villageId,
      head_name: "نمونه سرپرست خانوار",
      national_id: "1234567890",
      bank_iban: "IR0000000000000000000000",
      status: "APPROVED",
    });

    const fleetOwner = await appContext.entities.upsertFleetOwner({
      user_id: fleetOwnerUser.id,
      cooperative_id: 1,
      full_name: "نمونه مالک ناوگان",
      national_id: "2345678901",
      bank_iban: "IR0000000000000000000001",
      status: "APPROVED",
    });

    const driver = await appContext.entities.upsertDriver({
      user_id: driverUser.id,
      cooperative_id: 1,
      full_name: "نمونه راننده",
      license_number: "LIC-123",
      status: "APPROVED",
    });

    const vehicle = await appContext.entities.upsertVehicle({
      owner_id: fleetOwner.id,
      cooperative_id: 1,
      license_plate: "IR-DEMO-01",
      vehicle_type: "TRUCK",
      capacity_tons: 20,
      status: "APPROVED",
    });

    await workspaceRepo.upsertMembership({
      user_id: driverUser.id,
      mine_id: mineId,
      cooperative_id: 1,
      role_in_workspace: "DRIVER",
      status: "ACTIVE",
    });

    const { load, mission } = await appContext.mission.createDemoLoadAndMission({
      mine_id: mineId,
      household_id: household.id,
      owner_id: fleetOwner.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      material_type: body.data.material_type,
      quantity_tons: body.data.quantity_tons,
    });

    return res.json(
      success(
        {
          seeded: true,
          mine_id: mineId,
          load,
          mission,
          entities: {
            driver: { id: driver.id, user_id: driver.user_id, mobile: driverUser.mobile_number },
            fleetOwner: { id: fleetOwner.id, user_id: fleetOwner.user_id, mobile: fleetOwnerUser.mobile_number },
            household: { id: household.id, user_id: household.user_id, mobile: householdUser.mobile_number },
            consultant: { user_id: consultantUser.id, mobile: consultantUser.mobile_number },
          },
          admin_mobile: admin.mobile_number,
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

/** E2E-UAT-HAUL-1: grant workspace for dispatched driver (dev only). */
router.post(
  "/__dev/workspaces/ensure-driver-mine",
  requireAuth,
  requireRoles(["ADMIN"]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const body = z
        .object({
          mine_id: z.number().int().positive(),
          driver_id: z.number().int().positive(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({
          success: false,
          error: { code: "invalid_request", message: "Invalid input", details: body.error.flatten(), requestId },
        });
      }

      const driver = await prisma.drivers.findUnique({ where: { id: BigInt(body.data.driver_id) } });
      if (!driver) {
        return res.status(404).json({
          success: false,
          error: { code: "driver_not_found", message: "Driver not found", requestId },
        });
      }

      const coopId = driver.cooperative_id != null ? toNum(driver.cooperative_id) : 1;
      await workspaceRepo.upsertMembership({
        user_id: toNum(driver.user_id),
        mine_id: body.data.mine_id,
        cooperative_id: coopId,
        role_in_workspace: "DRIVER",
        status: "ACTIVE",
      });

      const user = await prisma.users.findUnique({ where: { id: driver.user_id } });
      return res.json(
        success(
          {
            ok: true,
            mine_id: body.data.mine_id,
            driver_id: body.data.driver_id,
            mobile_number: user?.mobile_number ?? null,
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

/** E2E-UAT-HAUL-1 / PILOT reruns: clear settlement + period_statement for mine/month (dev only). */
router.post(
  "/__dev/cleanup/settlement-period",
  requireAuth,
  requireRoles(["ADMIN"]),
  async (req, res, next) => {
    const requestId = (req as { requestId?: string }).requestId;
    try {
      const body = z
        .object({
          mine_id: z.number().int().positive(),
          year: z.number().int().min(2000).max(2100).optional(),
          month: z.number().int().min(1).max(12).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({
          success: false,
          error: { code: "invalid_request", message: "Invalid input", details: body.error.flatten(), requestId },
        });
      }

      const now = new Date();
      const year = body.data.year ?? now.getUTCFullYear();
      const month = body.data.month ?? now.getUTCMonth() + 1;
      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const period_key = `${year}-${String(month).padStart(2, "0")}`;
      const mineId = BigInt(body.data.mine_id);

      const loads = await prisma.loads.findMany({
        where: { mine_id: mineId },
        select: { id: true },
      });
      let closedMissions = 0;
      if (loads.length > 0) {
        const result = await prisma.missions.updateMany({
          where: {
            load_id: { in: loads.map((l) => l.id) },
            status: { in: ACTIVE_MISSION_STATUSES },
          },
          data: { status: "VERIFIED", verified_at: new Date() },
        });
        closedMissions = result.count;
      }

      const batches = await prisma.settlement_batches.findMany({
        where: { mine_id: mineId, period_start: periodStart },
        select: { id: true },
      });
      for (const b of batches) {
        await prisma.settlement_batch_approvals.deleteMany({ where: { settlement_batch_id: b.id } });
        await prisma.payment_payouts.deleteMany({ where: { settlement_batch_id: b.id } });
        await prisma.settlement_lines.deleteMany({ where: { batch_id: b.id } });
      }
      const deletedBatches = await prisma.settlement_batches.deleteMany({
        where: { mine_id: mineId, period_start: periodStart },
      });

      const statements = await prisma.period_statements.findMany({
        where: { mine_id: mineId, period_key },
      });
      for (const row of statements) {
        await prisma.period_statement_approvals.deleteMany({ where: { period_statement_id: row.id } });
        await prisma.period_statement_lines.deleteMany({ where: { period_statement_id: row.id } });
        await prisma.period_statements.delete({ where: { id: row.id } });
      }

      return res.json(
        success(
          {
            ok: true,
            mine_id: body.data.mine_id,
            year,
            month,
            deleted_batches: deletedBatches.count,
            deleted_statements: statements.length,
            closed_active_missions: closedMissions,
          },
          requestId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

/** E2E: pre-register a mobile before OTP login (dev/test only). */
router.post("/__dev/users/register", requireAuth, requireRoles(["ADMIN"]), async (req, res, next) => {
  const requestId = (req as { requestId?: string }).requestId;
  if (env.NODE_ENV === "production") {
    return res.status(404).json(failure("not_found", "Not found", undefined, requestId));
  }
  try {
    const body = z
      .object({
        mobile_number: z.string().regex(/^09\d{9}$/),
        role: z.enum(UserRoles).optional().default("HOUSEHOLD"),
        cooperative_id: z.number().int().positive().optional(),
        is_active: z.boolean().optional().default(true),
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        success: false,
        error: { code: "invalid_request", message: "Invalid input", details: body.error.flatten(), requestId },
      });
    }
    const user = await appContext.userStore.upsertUserByMobile(
      body.data.mobile_number,
      body.data.role as UserRole,
      {
        cooperative_id: body.data.cooperative_id,
        is_active: body.data.is_active,
      },
    );
    return res.json(success({ user }, requestId));
  } catch (e) {
    next(e);
  }
});

export const devSeedRouter = router;
