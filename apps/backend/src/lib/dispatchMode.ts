import { prisma } from "../db/prisma";
import { getDispatchMode } from "../config/env";
import { toBig, toNum } from "../repositories/id";

export type DispatchModeEffective = {
  effective: "manual" | "auto";
  source: "mine" | "env";
  stored: "manual" | "auto" | null;
};

export async function resolveDispatchMode(mineId: number): Promise<DispatchModeEffective> {
  const row = await prisma.mines.findUnique({
    where: { id: toBig(mineId) },
    select: { dispatch_mode: true },
  });
  const stored = row?.dispatch_mode;
  if (stored === "manual" || stored === "auto") {
    return { effective: stored, source: "mine", stored };
  }
  const envMode = getDispatchMode();
  return { effective: envMode, source: "env", stored: null };
}

export async function isDispatchAutoForMine(mineId: number): Promise<boolean> {
  const { effective } = await resolveDispatchMode(mineId);
  return effective === "auto";
}
