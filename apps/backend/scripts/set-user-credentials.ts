/**
 * Set username + password for an existing user (no role/mine changes).
 * Usage: npx tsx scripts/set-user-credentials.ts --mobile 09013019626 --username oktay --password oktay1380
 */
import "dotenv/config";
import { initAppContext } from "../src/lib/appInit";
import { setUserCredentialsByMobile } from "../src/services/userProvisioningService";

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1]?.trim();
}

async function main() {
  const mobile = readArg("--mobile");
  const username = readArg("--username");
  const password = readArg("--password");

  if (!mobile || !username || !password) {
    console.error("Usage: npx tsx scripts/set-user-credentials.ts --mobile 09... --username name --password secret");
    process.exit(1);
  }

  await initAppContext();
  const user = await setUserCredentialsByMobile({ mobile_number: mobile, username, password });
  console.log(`OK: user #${user.id} (${user.mobile_number}) username=${user.username}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
