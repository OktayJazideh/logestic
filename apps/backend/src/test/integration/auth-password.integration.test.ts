import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db/prisma";
import { hashPassword } from "../../lib/passwordHash";
import { http, isServerUp } from "../helpers/http";

const TEST_USERNAME = "vitestpwd";
const TEST_PASSWORD = "vitest12";
const ADMIN_MOBILE = "09000000000";

describe("auth password login integration", () => {
  let serverUp = false;
  let restoredUsername: string | null = null;
  let restoredPasswordHash = "";

  beforeAll(async () => {
    serverUp = await isServerUp();
    if (!serverUp) return;

    const admin = await prisma.users.findUnique({ where: { mobile_number: ADMIN_MOBILE } });
    if (!admin) return;

    restoredUsername = admin.username;
    restoredPasswordHash = admin.password_hash;

    await prisma.users.update({
      where: { id: admin.id },
      data: {
        username: TEST_USERNAME,
        password_hash: await hashPassword(TEST_PASSWORD),
      },
    });
  });

  afterAll(async () => {
    if (serverUp) {
      const admin = await prisma.users.findUnique({ where: { mobile_number: ADMIN_MOBILE } });
      if (admin) {
        await prisma.users.update({
          where: { id: admin.id },
          data: {
            username: restoredUsername,
            password_hash: restoredPasswordHash,
          },
        });
      }
    }
    await prisma.$disconnect();
  });

  it("login-password → me", async (ctx) => {
    if (!serverUp) ctx.skip();
    const login = await http("/api/auth/login-password", {
      method: "POST",
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    expect(login.status).toBe(200);
    expect(login.json.success).toBe(true);
    const token = login.json.data.access_token as string;
    expect(token.length).toBeGreaterThan(10);
    expect(login.json.data.role).toBe("ADMIN");

    const me = await http("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(me.json.data.role).toBe("ADMIN");
  });

  it("rejects invalid credentials", async (ctx) => {
    if (!serverUp) ctx.skip();
    const login = await http("/api/auth/login-password", {
      method: "POST",
      body: JSON.stringify({ username: TEST_USERNAME, password: "wrong-password" }),
    });
    expect(login.status).toBe(401);
    expect(login.json.error?.code).toBe("invalid_credentials");
  });
});
