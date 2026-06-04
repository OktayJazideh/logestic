/**
 * Smoke: duplicate bank_iban rejected across household / fleet_owner.
 */
import "dotenv/config";
import { prisma } from "../src/db/prisma";
import { assertIbanAvailable } from "../src/lib/ibanEnforcement";

const IBAN = "IR820540102680020817909002";

async function main() {
  const hh = await prisma.households.findFirst({
    where: { bank_iban: IBAN },
    select: { id: true },
  });
  if (!hh) {
    // eslint-disable-next-line no-console
    console.log("skip: no household with seed IBAN — run SEED_UAT_ENTITIES=1 db:seed first");
    return;
  }

  let threw = false;
  try {
    await assertIbanAvailable("fleet_owner", IBAN, undefined, prisma);
  } catch (e) {
    threw = (e as { code?: string }).code === "iban_taken";
  }
  if (!threw) throw new Error("expected iban_taken when reusing household IBAN on fleet_owner");

  // eslint-disable-next-line no-console
  console.log("test-iban-unique1 OK");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
