/**
 * Ephemeral HTTP server on 127.0.0.1 for local Playwright / integration runs.
 * Usage: npx tsx scripts/serve-test.ts
 */
import { ensureTestHttpServer } from "./lib/testHttpServer";

void (async () => {
  const base = await ensureTestHttpServer();
  console.log(`test_server_listening ${base}`);
  process.stdin.resume();
})();
