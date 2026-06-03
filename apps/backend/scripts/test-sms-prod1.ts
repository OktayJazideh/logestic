/**
 * SMS-PROD-1: SmsProvider factory, mock OTP log gating, sendOtp wiring.
 * Run 3x: npm run test:sms-prod1
 *
 * Live Kavenegar on VPS (reads /etc/logestic/backend.env when --live):
 *   npm run test:sms-prod1 -- --live
 */
import fs from "node:fs";
import "dotenv/config";
import { getSmsApiKey, getSmsSenderLine, isProduction, resolveSmsProvider } from "../src/config/env";
import {
  MockSmsProvider,
  createSmsProvider,
  getSmsProvider,
  resetSmsProviderForTests,
} from "../src/lib/smsProvider";
import { sendOtp } from "../src/services/notificationService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Load systemd env file on VPS so `npm run test:sms-prod1 -- --live` sees SMS_* vars. */
function loadBackendEnvFile() {
  const path = process.env.BACKEND_ENV_FILE ?? "/etc/logestic/backend.env";
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    process.env[key] = val;
  }
  // eslint-disable-next-line no-console
  console.log(`[test:sms-prod1] loaded env from ${path}`);
}

async function testMockProviderLogsInDev() {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const mock = new MockSmsProvider();
    await mock.sendOtp("09120000001", "123456");
    assert(logs.some((l) => l.includes("123456")), "mock should log OTP code in dev");
    assert(logs.some((l) => l.includes("[sms:mock:otp]")), "mock log prefix");
  } finally {
    console.log = orig;
  }
}

async function testMockProviderSilentInProd() {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const mock = new MockSmsProvider();
    await mock.sendOtp("09120000002", "654321");
    assert(!logs.some((l) => l.includes("654321")), "mock must not log OTP in production");
  } finally {
    console.log = orig;
    process.env.NODE_ENV = prev;
  }
}

async function testProviderFactory() {
  resetSmsProviderForTests();
  const prevProvider = process.env.SMS_PROVIDER;
  const prevKey = process.env.SMS_API_KEY;
  process.env.SMS_PROVIDER = "mock";
  delete process.env.SMS_API_KEY;
  resetSmsProviderForTests();
  const p = createSmsProvider();
  assert(p instanceof MockSmsProvider, "SMS_PROVIDER=mock → MockSmsProvider");
  process.env.SMS_PROVIDER = prevProvider;
  if (prevKey) process.env.SMS_API_KEY = prevKey;
  resetSmsProviderForTests();
}

async function testSendOtpStub() {
  const prevProvider = process.env.SMS_PROVIDER;
  const prevKey = process.env.SMS_API_KEY;
  process.env.SMS_PROVIDER = "mock";
  delete process.env.SMS_API_KEY;
  resetSmsProviderForTests();
  try {
    const result = await sendOtp("09120000003", "111222");
    assert(result.stub === true, "sendOtp stub when mock");
    assert(result.ok === true, "sendOtp ok");
  } finally {
    if (prevProvider) process.env.SMS_PROVIDER = prevProvider;
    else delete process.env.SMS_PROVIDER;
    if (prevKey) process.env.SMS_API_KEY = prevKey;
    else delete process.env.SMS_API_KEY;
    resetSmsProviderForTests();
  }
}

async function testLiveKavenegar(receptor: string) {
  if (!getSmsApiKey() || resolveSmsProvider() !== "kavenegar") {
    console.log("[test:sms-prod1] skip live — set SMS_PROVIDER=kavenegar + SMS_API_KEY");
    return;
  }
  const sender = getSmsSenderLine();
  assert(sender.length > 0, "SMS_SENDER_LINE required for live test");
  resetSmsProviderForTests();
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  console.log(`[test:sms-prod1] live send to ${receptor} sender=${sender} (code not logged in prod)`);
  if (!isProduction()) {
    console.log(`[test:sms-prod1] dev-only code=${code}`);
  }
  await getSmsProvider().sendOtp(receptor, code);
  console.log("[test:sms-prod1] live Kavenegar OK");
}

function isKavenegarSenderAccessError(err: unknown): boolean {
  return err instanceof Error && /kavenegar_427_/.test(err.message);
}

async function main() {
  const live = process.argv.includes("--live");
  if (live) {
    loadBackendEnvFile();
    resetSmsProviderForTests();
  }
  const receptor = process.env.SMS_TEST_MOBILE ?? "09013019626";

  await testMockProviderLogsInDev();
  await testMockProviderSilentInProd();
  await testProviderFactory();
  await testSendOtpStub();

  if (live) {
    try {
      await testLiveKavenegar(receptor);
    } catch (err) {
      if (isKavenegarSenderAccessError(err)) {
        console.error(
          "[test:sms-prod1] Kavenegar 427: خط ارسال در پنل نیاز به «سطح دسترسی» دارد — My Account → خطوط → فعال‌سازی API برای SMS_SENDER_LINE",
        );
        process.exit(1);
      }
      throw err;
    }
  }

  console.log("SMS-PROD-1 OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
