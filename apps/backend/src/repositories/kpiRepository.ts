import { prisma } from "../db/prisma";
import { toDecimal } from "./decimal";

export type KpiSnapshotRow = {
  snapshot_date: Date;
  mine_id: number;
  key: string;
  value: number;
};

export async function upsertSnapshots(rows: KpiSnapshotRow[]) {
  for (const row of rows) {
    await prisma.kpi_snapshots.upsert({
      where: {
        snapshot_date_mine_id_key: {
          snapshot_date: row.snapshot_date,
          mine_id: BigInt(row.mine_id),
          key: row.key,
        },
      },
      create: {
        snapshot_date: row.snapshot_date,
        mine_id: BigInt(row.mine_id),
        key: row.key,
        value: toDecimal(row.value),
      },
      update: {
        value: toDecimal(row.value),
      },
    });
  }
}

export async function listSnapshots(params: {
  from: Date;
  to: Date;
  mine_id?: number;
  keys?: string[];
}) {
  const rows = await prisma.kpi_snapshots.findMany({
    where: {
      snapshot_date: { gte: params.from, lte: params.to },
      ...(params.mine_id != null ? { mine_id: BigInt(params.mine_id) } : {}),
      ...(params.keys?.length ? { key: { in: params.keys } } : {}),
    },
    orderBy: [{ snapshot_date: "asc" }, { mine_id: "asc" }, { key: "asc" }],
  });
  return rows.map((r) => ({
    snapshot_date: r.snapshot_date.toISOString().slice(0, 10),
    mine_id: Number(r.mine_id),
    key: r.key,
    value: Number(r.value),
  }));
}

export async function deleteSnapshotsForTests(mineId?: number) {
  await prisma.kpi_snapshots.deleteMany({
    where: mineId != null ? { mine_id: BigInt(mineId) } : {},
  });
}
