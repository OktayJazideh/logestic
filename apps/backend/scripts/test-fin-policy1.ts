/**
 * FIN-POLICY-1: resolveFinancePolicy + operational split (99/1) vs community (independent).
 * Run: npm run test:fin-policy1
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import {
  computeCommunityContribution,
  splitOperational,
} from "../src/repositories/financeLedgerRepository";
import { resolveFinancePolicy } from "../src/services/financePolicyService";
import { MineConfigIncompleteError } from "../src/lib/mineConfigErrors";

const MINE_ID = 1;
const RATE = 500_000;
const TONS_KG = 20_000;
const FARE = 1_000_000;

async function ensureMineFinanceFixture(platformFee: number) {
  await prisma.mines.update({
    where: { id: BigInt(MINE_ID) },
    data: { platform_fee_value: platformFee, allow_legacy_community_percent: false },
  });
  const contract = await prisma.service_contracts.findFirst({
    where: {
      mine_id: BigInt(MINE_ID),
      cooperative_id: BigInt(1),
      operation_type_code: "HAUL_TONNAGE",
      status: "ACTIVE",
    },
  });
  if (contract) {
    await prisma.service_contracts.update({
      where: { id: contract.id },
      data: { fixed_community_amount_rial_per_unit: RATE },
    });
  }
}

async function assertIncompleteWhenPlatformMissing() {
  await prisma.mines.update({
    where: { id: BigInt(MINE_ID) },
    data: { platform_fee_value: null },
  });
  try {
    await resolveFinancePolicy(MINE_ID, { mineId: MINE_ID, at: new Date() });
    throw new Error("expected MineConfigIncompleteError when platform_fee_value null");
  } catch (e) {
    if (!(e instanceof MineConfigIncompleteError)) throw e;
    if (!e.details || !(e.details as { missing?: string[] }).missing?.includes("platform_fee_value")) {
      throw new Error("expected missing platform_fee_value in details");
    }
  }
  // eslint-disable-next-line no-console
  console.log("FIN-POLICY-1 incomplete-config OK (no silent default)");
}

async function assertTwoPercentPlatformOnMine() {
  await ensureMineFinanceFixture(0.02);
  const ctx = { mineId: MINE_ID, at: new Date() };
  const policy = await resolveFinancePolicy(MINE_ID, ctx);

  if (policy.platform_fee_mode !== "PERCENTAGE_OF_OPERATIONAL_PAYMENT") {
    throw new Error("expected PERCENTAGE_OF_OPERATIONAL_PAYMENT platform_fee_mode");
  }
  if (policy.community_contribution_mode !== "FIXED_RIAL_PER_UNIT") {
    throw new Error("expected FIXED_RIAL_PER_UNIT community mode");
  }
  if (policy.platform_fee_value !== 0.02) {
    throw new Error(`expected platform 0.02 from mine, got ${policy.platform_fee_value}`);
  }
  if (policy.community_contribution_value !== RATE) {
    throw new Error(`expected community rate ${RATE}, got ${policy.community_contribution_value}`);
  }

  const { ownerAmount, platformAmount } = await splitOperational(FARE, ctx);
  const community = await computeCommunityContribution(TONS_KG, ctx);

  if (Math.abs(platformAmount - FARE * 0.02) > 0.01) {
    throw new Error(`regression: platform expected ${FARE * 0.02}, got ${platformAmount}`);
  }
  if (community !== 20 * RATE) {
    throw new Error(`regression: community expected ${20 * RATE}, got ${community}`);
  }
  if (Math.abs(ownerAmount + platformAmount - FARE) > 0.01) {
    throw new Error("regression: owner + platform must equal fare");
  }
  // eslint-disable-next-line no-console
  console.log("FIN-POLICY-1 2% mine OK (COMM-TON-1 compatible)");
}

async function assertOnePercentPlatformOnMine() {
  await ensureMineFinanceFixture(0.01);

  const ctx = { mineId: MINE_ID, at: new Date() };
  const policy = await resolveFinancePolicy(MINE_ID, ctx);
  if (policy.platform_fee_value !== 0.01) {
    throw new Error(`expected mine platform 0.01, got ${policy.platform_fee_value}`);
  }

  const { ownerAmount, platformAmount } = await splitOperational(FARE, ctx);
  const expectedPlatform = Math.round(FARE * 0.01);
  if (platformAmount !== expectedPlatform) {
    throw new Error(`1% platform: expected ${expectedPlatform}, got ${platformAmount}`);
  }

  const community = await computeCommunityContribution(TONS_KG, ctx);
  const operationalSum = ownerAmount + platformAmount;
  if (operationalSum !== FARE) {
    throw new Error(`operational parts must sum to fare: ${operationalSum} !== ${FARE}`);
  }
  if (community <= 0) {
    throw new Error("community contribution must be positive");
  }
  if (operationalSum + community === FARE) {
    throw new Error("community must not be folded into operational fare split");
  }
  if (Math.abs(platformAmount - (FARE + community) * 0.01) < 1) {
    throw new Error("platform fee must not be computed on fare + community");
  }

  // eslint-disable-next-line no-console
  console.log(
    `FIN-POLICY-1 1% mine OK — platform=${platformAmount}, owner=${ownerAmount}, community=${community} (separate)`,
  );
}

async function main() {
  await assertIncompleteWhenPlatformMissing();
  await assertTwoPercentPlatformOnMine();
  await assertOnePercentPlatformOnMine();
  // eslint-disable-next-line no-console
  console.log("FIN-POLICY-1: all checks passed");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
