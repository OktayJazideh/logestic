import { env, getSmsApiKey, getSmsSenderLine, isProduction, resolveSmsProvider } from "../config/env";

export interface SmsProvider {
  sendOtp(mobile: string, code: string): Promise<void>;
  sendMessage(mobile: string, message: string): Promise<void>;
}

export class MockSmsProvider implements SmsProvider {
  async sendOtp(mobile: string, code: string): Promise<void> {
    if (!isProduction()) {
      // eslint-disable-next-line no-console
      console.log(`[sms:mock:otp] to=${mobile} code=${code}`);
    }
  }

  async sendMessage(mobile: string, message: string): Promise<void> {
    if (!isProduction()) {
      // eslint-disable-next-line no-console
      console.log(`[sms:mock] to=${mobile} body=${message.slice(0, 120)}`);
    }
  }
}

export class KavenegarProvider implements SmsProvider {
  constructor(
    private apiKey: string,
    private sender: string,
  ) {}

  /** REST client — encodes API key (may end with `=`) unlike legacy kavenegar npm path. */
  private async send(data: { message: string; sender: string; receptor: string }): Promise<void> {
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`;
    const body = new URLSearchParams({
      receptor: data.receptor,
      sender: data.sender,
      message: data.message,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      return?: { status?: number; message?: string };
    };
    const status = json.return?.status;
    const message = json.return?.message;
    if (status !== 200) {
      throw new Error(`kavenegar_${status ?? res.status}_${message ?? "send_failed"}`);
    }
  }

  async sendOtp(mobile: string, code: string): Promise<void> {
    const brand = env.PLATFORM_NAME.trim() || "همسهمان";
    await this.send({
      message: `کد ورود ${brand}: ${code}`,
      sender: this.sender,
      receptor: mobile,
    });
  }

  async sendMessage(mobile: string, message: string): Promise<void> {
    await this.send({ message, sender: this.sender, receptor: mobile });
  }
}

export class FarazSmsProvider implements SmsProvider {
  constructor(
    private apiKey: string,
    private sender: string,
  ) {}

  private async post(message: string, mobile: string): Promise<void> {
    const res = await fetch("https://api2.ippanel.com/api/v1/sms/send/webservice/single", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `AccessKey ${this.apiKey}`,
      },
      body: JSON.stringify({
        recipient: mobile,
        sender: this.sender,
        message,
      }),
    });
    if (!res.ok) throw new Error(`farazsms_http_${res.status}`);
  }

  async sendOtp(mobile: string, code: string): Promise<void> {
    await this.post(`کد ورود همسهمان: ${code}`, mobile);
  }

  async sendMessage(mobile: string, message: string): Promise<void> {
    await this.post(message, mobile);
  }
}

export function createSmsProvider(): SmsProvider {
  const provider = resolveSmsProvider();
  if (provider === "mock") return new MockSmsProvider();

  const apiKey = getSmsApiKey();
  const sender = getSmsSenderLine();
  if (!apiKey) return new MockSmsProvider();

  if (provider === "kavenegar") return new KavenegarProvider(apiKey, sender);
  if (provider === "faraz") return new FarazSmsProvider(apiKey, sender);

  return new MockSmsProvider();
}

let providerInstance: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!providerInstance) providerInstance = createSmsProvider();
  return providerInstance;
}

/** @internal tests may reset after changing env */
export function resetSmsProviderForTests() {
  providerInstance = null;
}

export function smsProviderIsStub(): boolean {
  if (resolveSmsProvider() === "mock") return true;
  return !getSmsApiKey();
}
