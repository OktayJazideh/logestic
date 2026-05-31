import { Prisma } from "@prisma/client";

export function toDecimal(amount: number): Prisma.Decimal {
  return new Prisma.Decimal(amount.toFixed(2));
}

export function fromDecimal(v: Prisma.Decimal | number | string | { toString(): string }): number {
  return Number(v);
}
