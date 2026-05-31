import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initAppContext } from "../../lib/appInit";
import { appContext } from "../../appContext";
import { prisma } from "../../db/prisma";
import { http, isServerUp, loginAs, selectMine } from "../helpers/http";

function uuidV4(): string {
  return crypto.randomUUID();
}

describe("idempotency integration", () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerUp();
    if (serverUp) {
      await initAppContext();
      await appContext.mineData.hydrate();
      await appContext.userStore.upsertUserByMobile("09000000007", "EMPLOYER", { is_active: true });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.runIf(() => serverUp)("replays cached response on duplicate Idempotency-Key", async () => {
    const employerToken = await loginAs("09000000007");
    await selectMine(employerToken, 1);

    const body = {
      village_id: 1,
      material_type: "ORE",
      quantity_tons: 22.5,
    };

    const idemKey = uuidV4();
    const first = await http("/api/employer/needs", {
      method: "POST",
      headers: { Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify(body),
      idempotencyKey: idemKey,
    });
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(first.json.success).toBe(true);
    const needId1 = first.json.data.need.id as number;

    const second = await http("/api/employer/needs", {
      method: "POST",
      headers: { Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify(body),
      idempotencyKey: idemKey,
    });
    expect(second.status).toBe(first.status);
    expect(second.json.success).toBe(true);
    expect(second.replayed).toBe("true");
    expect(second.json.data.need.id).toBe(needId1);
  });
});
