/** Shared form validators — messages in Persian; align with backend where noted. */

export type FieldValidator = (value: string) => string | undefined;

export function required(label = "این فیلد"): FieldValidator {
  return (value) => (value.trim() ? undefined : `${label} الزامی است.`);
}

export function minLength(min: number, label = "متن"): FieldValidator {
  return (value) =>
    value.trim().length >= min ? undefined : `${label} حداقل ${min} کاراکتر باشد.`;
}

export function maxLength(max: number, label = "متن"): FieldValidator {
  return (value) =>
    value.trim().length <= max ? undefined : `${label} حداکثر ${max} کاراکتر باشد.`;
}

/** Backend auth: 9–15 digits (auth.ts MobileSchema). */
export function mobileNumber(): FieldValidator {
  return (value) => {
    const m = value.trim();
    if (!/^\d{9,15}$/.test(m)) {
      return "شماره موبایل باید ۹ تا ۱۵ رقم (فقط عدد) باشد.";
    }
    return undefined;
  };
}

/** Provisioning / admin user create: 09 + 9 digits. */
export function provisioningMobile(): FieldValidator {
  return (value) => {
    const m = value.trim();
    if (!/^09\d{9}$/.test(m)) {
      return "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.";
    }
    return undefined;
  };
}

const PERSIAN_NAME_PATTERN = /^[\u0600-\u06FF\u200c\s]+$/;

function normalizePersianText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9");
}

export function persianName(label = "نام"): FieldValidator {
  return (value) => {
    const t = value.trim();
    if (!t) return undefined;
    const n = normalizePersianText(t);
    if (n.length < 2 || n.length > 200) return `${label} باید بین ۲ تا ۲۰۰ کاراکتر فارسی باشد.`;
    if (!PERSIAN_NAME_PATTERN.test(n) || !/[\u0600-\u06FF]/.test(n)) {
      return `${label} باید فقط با حروف فارسی نوشته شود.`;
    }
    return undefined;
  };
}

export function optionalPersianName(label = "نام"): FieldValidator {
  return (value) => {
    if (!value.trim()) return undefined;
    return persianName(label)(value);
  };
}

export function otpCode(): FieldValidator {
  return (value) => (/^\d{6}$/.test(value.trim()) ? undefined : "کد باید دقیقاً ۶ رقم باشد.");
}

export function positiveNumber(label = "مقدار"): FieldValidator {
  return (value) => {
    const n = Number(value.trim().replace(/,/g, "."));
    if (!Number.isFinite(n) || n <= 0) return `${label} باید عدد مثبت باشد.`;
    return undefined;
  };
}

export function nonNegativeNumber(label = "مقدار"): FieldValidator {
  return (value) => {
    const n = Number(value.trim().replace(/,/g, "."));
    if (!Number.isFinite(n) || n < 0) return `${label} باید عدد نامنفی باشد.`;
    return undefined;
  };
}

export function positiveInt(label = "شناسه"): FieldValidator {
  return (value) => {
    const n = Number(value.trim());
    if (!Number.isInteger(n) || n <= 0) return `${label} باید عدد صحیح مثبت باشد.`;
    return undefined;
  };
}

export function optionalPositiveNumber(label = "مقدار"): FieldValidator {
  return (value) => {
    if (!value.trim()) return undefined;
    return positiveNumber(label)(value);
  };
}

export function dateRequired(label = "تاریخ"): FieldValidator {
  return (value) => (value.trim() ? undefined : `${label} الزامی است.`);
}

export function dateRange(from: string, to: string): string | undefined {
  if (!from.trim() || !to.trim()) return undefined;
  if (from > to) return "تاریخ «از» نباید بعد از تاریخ «تا» باشد.";
  return undefined;
}

export function runValidators(value: string, validators: FieldValidator[]): string | undefined {
  for (const v of validators) {
    const err = v(value);
    if (err) return err;
  }
  return undefined;
}

export type FieldSchema = Record<string, { value: string; validators: FieldValidator[] }>;

export function validateSchema(schema: FieldSchema): Record<string, string | undefined> {
  const errors: Record<string, string | undefined> = {};
  for (const [name, { value, validators }] of Object.entries(schema)) {
    errors[name] = runValidators(value, validators);
  }
  return errors;
}

export function schemaHasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
