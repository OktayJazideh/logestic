/**
 * One-shot: create user_workspace_memberships for scoped roles missing a row.
 * Run on VPS: cd apps/backend && npx tsx scripts/backfill-workspace-memberships.ts
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import {
  membershipKindForRole,
  upsertMembership,
} from "../src/repositories/workspaceMembershipsRepository";
import { isGlobalWorkspaceRole } from "../src/services/userProvisioningService";
import { toNum } from "../src/repositories/id";
import type { UserRole } from "../src/types/userRole";

async function main() {
  const users = await prisma.users.findMany({
    where: { deleted_at: null, is_active: true },
    include: {
      user_workspace_memberships: { where: { status: "ACTIVE" } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const role = u.role as UserRole;
    if (isGlobalWorkspaceRole(role)) {
      skipped++;
      continue;
    }
    if (!membershipKindForRole(role)) {
      skipped++;
      continue;
    }
    if (u.user_workspace_memberships.length > 0) {
      skipped++;
      continue;
    }

    const cooperativeId = u.cooperative_id != null ? toNum(u.cooperative_id) : undefined;
    let mineId: number | null = null;

    if (cooperativeId != null) {
      const coop = await prisma.cooperatives.findUnique({ where: { id: u.cooperative_id! } });
      if (coop) mineId = toNum(coop.mine_id);
    }

    if (mineId == null) {
      // eslint-disable-next-line no-console
      console.warn(`SKIP user ${u.id} (${u.mobile_number}, ${role}): no cooperative/mine to infer`);
      skipped++;
      continue;
    }

    await upsertMembership({
      user_id: toNum(u.id),
      mine_id: mineId,
      cooperative_id: cooperativeId,
      role_in_workspace: role,
      status: "ACTIVE",
    });
    // eslint-disable-next-line no-console
    console.log(`OK user ${u.id} ${u.mobile_number} ${role} mine=${mineId}`);
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(`Done: ${created} created, ${skipped} skipped`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
