import type {
  Prisma,
  WeighbridgeAdjustmentStatus,
  WeighbridgeManualReason,
  WeighbridgeTicketStatus,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { toBig, toNum } from "./id";
import { fromDecimal, toDecimal } from "./decimal";

export type WeighbridgeTicketRow = {
  id: number;
  mission_id: number;
  ticket_number: string;
  status: WeighbridgeTicketStatus;
  empty_weight: number;
  loaded_weight: number;
  net_weight: number;
  entry_source?: string | null;
  entry_note?: string | null;
  reason_code?: WeighbridgeManualReason | null;
  requires_supervisor_approve: boolean;
  created_at: Date;
  updated_at: Date;
};

export type WeighbridgeAdjustmentRow = {
  id: number;
  ticket_id: number;
  mission_id: number;
  reason: string;
  before_net: number;
  after_net: number;
  status: WeighbridgeAdjustmentStatus;
  requested_by_user_id: number;
  approved_by_user_id?: number;
  created_at: Date;
};

type Tx = Prisma.TransactionClient;

function mapTicket(r: {
  id: bigint;
  mission_id: bigint;
  ticket_number: string;
  status: WeighbridgeTicketStatus;
  empty_weight: { toString(): string };
  loaded_weight: { toString(): string };
  net_weight: { toString(): string };
  entry_source?: string | null;
  entry_note?: string | null;
  reason_code?: WeighbridgeManualReason | null;
  requires_supervisor_approve?: boolean;
  created_at: Date;
  updated_at: Date;
}): WeighbridgeTicketRow {
  return {
    id: toNum(r.id),
    mission_id: toNum(r.mission_id),
    ticket_number: r.ticket_number,
    status: r.status,
    empty_weight: fromDecimal(r.empty_weight),
    loaded_weight: fromDecimal(r.loaded_weight),
    net_weight: fromDecimal(r.net_weight),
    entry_source: r.entry_source ?? null,
    entry_note: r.entry_note ?? null,
    reason_code: r.reason_code ?? null,
    requires_supervisor_approve: r.requires_supervisor_approve ?? false,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapAdjustment(r: {
  id: bigint;
  ticket_id: bigint;
  mission_id: bigint;
  reason: string;
  before_net: { toString(): string };
  after_net: { toString(): string };
  status: WeighbridgeAdjustmentStatus;
  requested_by_user_id: bigint;
  approved_by_user_id: bigint | null;
  created_at: Date;
}): WeighbridgeAdjustmentRow {
  return {
    id: toNum(r.id),
    ticket_id: toNum(r.ticket_id),
    mission_id: toNum(r.mission_id),
    reason: r.reason,
    before_net: fromDecimal(r.before_net),
    after_net: fromDecimal(r.after_net),
    status: r.status,
    requested_by_user_id: toNum(r.requested_by_user_id),
    approved_by_user_id: r.approved_by_user_id != null ? toNum(r.approved_by_user_id) : undefined,
    created_at: r.created_at,
  };
}

export async function getTicketById(ticketId: number, tx?: Tx): Promise<WeighbridgeTicketRow | null> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_tickets.findUnique({ where: { id: toBig(ticketId) } });
  return r ? mapTicket(r) : null;
}

export async function getTicketByMissionId(missionId: number, tx?: Tx): Promise<WeighbridgeTicketRow | null> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_tickets.findUnique({ where: { mission_id: toBig(missionId) } });
  return r ? mapTicket(r) : null;
}

export async function listTickets(params?: {
  status?: WeighbridgeTicketStatus;
  mineId?: number;
}): Promise<WeighbridgeTicketRow[]> {
  const rows = await prisma.weighbridge_tickets.findMany({
    where: {
      status: params?.status,
      ...(params?.mineId != null
        ? { mission: { load: { mine_id: toBig(params.mineId) } } }
        : {}),
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map(mapTicket);
}

export async function createTicket(
  params: {
    mission_id: number;
    ticket_number: string;
    created_by_user_id?: number;
  },
  tx?: Tx,
): Promise<WeighbridgeTicketRow> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_tickets.create({
    data: {
      mission_id: toBig(params.mission_id),
      ticket_number: params.ticket_number,
      empty_weight: toDecimal(0),
      loaded_weight: toDecimal(0),
      net_weight: toDecimal(0),
      status: "PENDING_EMPTY",
      created_by_user_id: params.created_by_user_id != null ? toBig(params.created_by_user_id) : null,
    },
  });
  return mapTicket(r);
}

export async function updateTicket(
  ticketId: number,
  data: {
    status?: WeighbridgeTicketStatus;
    empty_weight?: number;
    loaded_weight?: number;
    net_weight?: number;
    entry_source?: string | null;
    entry_note?: string | null;
    reason_code?: WeighbridgeManualReason | null;
    requires_supervisor_approve?: boolean;
    approved_by_user_id?: number;
  },
  tx?: Tx,
): Promise<WeighbridgeTicketRow | null> {
  const db = tx ?? prisma;
  try {
    const r = await db.weighbridge_tickets.update({
      where: { id: toBig(ticketId) },
      data: {
        status: data.status,
        empty_weight: data.empty_weight != null ? toDecimal(data.empty_weight) : undefined,
        loaded_weight: data.loaded_weight != null ? toDecimal(data.loaded_weight) : undefined,
        net_weight: data.net_weight != null ? toDecimal(data.net_weight) : undefined,
        entry_source: data.entry_source,
        entry_note: data.entry_note,
        reason_code: data.reason_code,
        requires_supervisor_approve: data.requires_supervisor_approve,
        approved_by_user_id: data.approved_by_user_id != null ? toBig(data.approved_by_user_id) : undefined,
      },
    });
    return mapTicket(r);
  } catch {
    return null;
  }
}

export async function listAdjustmentRequests(params?: {
  mineId?: number;
  status?: WeighbridgeAdjustmentStatus;
}): Promise<WeighbridgeAdjustmentRow[]> {
  const rows = await prisma.weighbridge_adjustment_requests.findMany({
    where: {
      status: params?.status,
      ...(params?.mineId != null
        ? { mission: { load: { mine_id: toBig(params.mineId) } } }
        : {}),
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map(mapAdjustment);
}

export async function getAdjustmentById(adjustmentId: number, tx?: Tx): Promise<WeighbridgeAdjustmentRow | null> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_adjustment_requests.findUnique({ where: { id: toBig(adjustmentId) } });
  return r ? mapAdjustment(r) : null;
}

export async function createAdjustmentRequest(params: {
  ticket_id: number;
  mission_id: number;
  reason: string;
  before_net: number;
  after_net: number;
  requested_by_user_id: number;
}): Promise<WeighbridgeAdjustmentRow> {
  const r = await prisma.weighbridge_adjustment_requests.create({
    data: {
      ticket_id: toBig(params.ticket_id),
      mission_id: toBig(params.mission_id),
      reason: params.reason,
      before_net: toDecimal(params.before_net),
      after_net: toDecimal(params.after_net),
      status: "PENDING",
      requested_by_user_id: toBig(params.requested_by_user_id),
    },
  });
  return mapAdjustment(r);
}

export async function updateAdjustment(
  adjustmentId: number,
  data: {
    status?: WeighbridgeAdjustmentStatus;
    approved_by_user_id?: number;
  },
  tx?: Tx,
): Promise<WeighbridgeAdjustmentRow | null> {
  const db = tx ?? prisma;
  try {
    const r = await db.weighbridge_adjustment_requests.update({
      where: { id: toBig(adjustmentId) },
      data: {
        status: data.status,
        approved_by_user_id: data.approved_by_user_id != null ? toBig(data.approved_by_user_id) : undefined,
      },
    });
    return mapAdjustment(r);
  } catch {
    return null;
  }
}

export type AgentIngestRow = {
  id: number;
  weighbridge_id: number;
  mission_id: number;
  reading_type: string;
  weight_kg: number;
  captured_at: Date;
  plate?: string | null;
  signature?: string | null;
  ticket_id: number;
  created_at: Date;
};

export async function findAgentIngest(
  params: {
    weighbridge_id: number;
    captured_at: Date;
    reading_type: string;
  },
  tx?: Tx,
): Promise<AgentIngestRow | null> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_agent_ingests.findUnique({
    where: {
      weighbridge_id_captured_at_reading_type: {
        weighbridge_id: params.weighbridge_id,
        captured_at: params.captured_at,
        reading_type: params.reading_type,
      },
    },
  });
  if (!r) return null;
  return {
    id: toNum(r.id),
    weighbridge_id: r.weighbridge_id,
    mission_id: toNum(r.mission_id),
    reading_type: r.reading_type,
    weight_kg: fromDecimal(r.weight_kg),
    captured_at: r.captured_at,
    plate: r.plate,
    signature: r.signature,
    ticket_id: toNum(r.ticket_id),
    created_at: r.created_at,
  };
}

export async function createAgentIngest(
  params: {
    weighbridge_id: number;
    mission_id: number;
    reading_type: string;
    weight_kg: number;
    captured_at: Date;
    plate?: string;
    signature?: string;
    ticket_id: number;
  },
  tx?: Tx,
): Promise<AgentIngestRow> {
  const db = tx ?? prisma;
  const r = await db.weighbridge_agent_ingests.create({
    data: {
      weighbridge_id: params.weighbridge_id,
      mission_id: toBig(params.mission_id),
      reading_type: params.reading_type,
      weight_kg: toDecimal(params.weight_kg),
      captured_at: params.captured_at,
      plate: params.plate ?? null,
      signature: params.signature ?? null,
      ticket_id: toBig(params.ticket_id),
    },
  });
  return {
    id: toNum(r.id),
    weighbridge_id: r.weighbridge_id,
    mission_id: toNum(r.mission_id),
    reading_type: r.reading_type,
    weight_kg: fromDecimal(r.weight_kg),
    captured_at: r.captured_at,
    plate: r.plate,
    signature: r.signature,
    ticket_id: toNum(r.ticket_id),
    created_at: r.created_at,
  };
}
