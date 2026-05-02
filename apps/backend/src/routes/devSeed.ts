import { Router } from "express";
import { z } from "zod";
import { appContext } from "../appContext";
import { success } from "../http/apiResponse";
import { requireRoles } from "../middleware/rbac";
import { authMiddleware, type AuthContext } from "../middleware/authMiddleware";
import { ApiError } from "../http/errors";

const router = Router();

// Dev-only endpoint to quickly seed a demo environment for Flutter testing.
const getAuthContext = (token: string): AuthContext | null => {
  const u = appContext.authService.getUserFromSession(token);
  if (!u) return null;
  const session = appContext.sessionStore.getSession(token);
  return { token, user: u, mineId: session?.mineId };
};

const requireAuth = authMiddleware(getAuthContext);

router.post("/__dev/seed/demo", requireAuth, requireRoles(["ADMIN"]), (req, res, next) => {
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

    // Seed users (roles are set directly in userStore so auth keeps them).
    const admin = appContext.userStore.upsertUserByMobile("09000000000", "ADMIN", { is_active: true });
    const coop = appContext.userStore.upsertUserByMobile("09000000001", "COOP", { is_active: true });
    const employer = appContext.userStore.upsertUserByMobile("09000000002", "EMPLOYER", { is_active: true });
    const driverUser = appContext.userStore.upsertUserByMobile("09000000003", "DRIVER", { is_active: true });
    const fleetOwnerUser = appContext.userStore.upsertUserByMobile("09000000004", "FLEET_OWNER", { is_active: true });
    const householdUser = appContext.userStore.upsertUserByMobile("09000000005", "HOUSEHOLD", { is_active: true });
    const consultantUser = appContext.userStore.upsertUserByMobile("09000000006", "CONSULTANT", { is_active: true });

    // Seed entities
    const villages = appContext.mineData.listVillagesByMine(mineId);
    const villageId = villages[0]?.id;
    if (!villageId) {
      return res.status(400).json({ success: false, error: { code: "no_villages", message: "Missing villages for mine", requestId } });
    }

    const household = appContext.entities.upsertHousehold({
      user_id: householdUser.id,
      village_id: villageId,
      head_name: "نمونه سرپرست خانوار",
      national_id: "1234567890",
      bank_iban: "IR0000000000000000000000",
      status: "APPROVED",
    });

    const fleetOwner = appContext.entities.upsertFleetOwner({
      user_id: fleetOwnerUser.id,
      full_name: "نمونه مالک ناوگان",
      national_id: "2345678901",
      bank_iban: "IR0000000000000000000001",
      status: "APPROVED",
    });

    const driver = appContext.entities.upsertDriver({
      user_id: driverUser.id,
      full_name: "نمونه راننده",
      license_number: "LIC-123",
      status: "APPROVED",
    });

    const vehicle = appContext.entities.upsertVehicle({
      owner_id: fleetOwner.id,
      license_plate: "IR-DEMO-01",
      vehicle_type: "TRUCK",
      capacity_tons: 20,
      status: "APPROVED",
    });

    // Seed one mission and load
    const { load, mission } = appContext.mission.createDemoLoadAndMission({
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
        },
        requestId,
      ),
    );
  } catch (e) {
    next(e);
  }
});

export const devSeedRouter = router;

