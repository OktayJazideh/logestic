import { prisma } from "../db/prisma";
import { ApiError } from "../http/errors";

export type OperationTypeRow = {
  id: string;
  code: string;
  category: string;
  name_fa: string;
  name_en?: string;
  verification_kind: string;
  pricing_kind: string;
  settlement_kind: string;
  is_active: boolean;
  created_at: Date;
};

function mapRow(r: {
  id: string;
  code: string;
  category: string;
  name_fa: string;
  name_en: string | null;
  verification_kind: string;
  pricing_kind: string;
  settlement_kind: string;
  is_active: boolean;
  created_at: Date;
}): OperationTypeRow {
  return {
    id: r.id,
    code: r.code,
    category: r.category,
    name_fa: r.name_fa,
    name_en: r.name_en ?? undefined,
    verification_kind: r.verification_kind,
    pricing_kind: r.pricing_kind,
    settlement_kind: r.settlement_kind,
    is_active: r.is_active,
    created_at: r.created_at,
  };
}

export async function listActive(): Promise<OperationTypeRow[]> {
  const rows = await prisma.operation_types.findMany({
    where: { is_active: true },
    orderBy: { code: "asc" },
  });
  return rows.map(mapRow);
}

export async function getById(id: string): Promise<OperationTypeRow | null> {
  const row = await prisma.operation_types.findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

export async function getByCode(code: string): Promise<OperationTypeRow | null> {
  const row = await prisma.operation_types.findUnique({ where: { code } });
  return row ? mapRow(row) : null;
}

export async function assertCodeExists(code: string): Promise<OperationTypeRow> {
  const row = await getByCode(code);
  if (!row || !row.is_active) {
    throw new ApiError({
      statusCode: 400,
      code: "invalid_operation_type",
      message: `Unknown or inactive operation type: ${code}`,
    });
  }
  return row;
}
