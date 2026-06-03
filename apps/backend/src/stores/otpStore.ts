import { OtpsRepository } from "../repositories/otpsRepository";

export type { OtpRequestResult } from "../repositories/otpsRepository";

/**
 * OTP store backed by Postgres (otps table).
 */
export class OtpStore extends OtpsRepository {}
