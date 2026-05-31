/** Map Prisma BigInt PK/FK to JS number for MVP store/route compatibility. */
export function toNum(id: bigint | number | null | undefined): number {
  if (id == null) return 0;
  return typeof id === "bigint" ? Number(id) : id;
}

export function toBig(id: number): bigint {
  return BigInt(id);
}
