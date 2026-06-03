/** Thrown when OTP SMS could not be delivered via a real provider (not mock). */
export class SmsDeliveryError extends Error {
  readonly code = "sms_send_failed" as const;

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SmsDeliveryError";
  }
}

export function isSmsDeliveryError(err: unknown): err is SmsDeliveryError {
  return err instanceof SmsDeliveryError;
}
