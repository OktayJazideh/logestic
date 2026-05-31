import { validateWeighbridgeApiKey } from "../config/env";
import { prisma } from "../db/prisma";
import * as loadsRepo from "../repositories/loadsRepository";
import * as missionsRepo from "../repositories/missionsRepository";
import * as weighbridgeRepo from "../repositories/weighbridgeRepository";
import { isWeighbridgeAnomaly } from "../lib/weighbridgeAnomaly";
import { publishEvent } from "./eventBus";
import type { WeighbridgeTicketStatus } from "../stores/missionStore";

export type AgentReadingType = "empty" | "loaded";

export type WeighbridgeIngestInput = {
  apiKey: string | undefined;
  weighbridge_id: number;
  mission_id: number;
  reading_type: AgentReadingType;
  weight_kg: number;
  captured_at: string;
  plate?: string;
  signature?: string;
};

export type WeighbridgeIngestSuccess = {
  ok: true;
  ticket_id: number;
  ticket_status: WeighbridgeTicketStatus;
  idempotent: boolean;
};

export type WeighbridgeIngestFailure = {
  ok: false;
  reason: string;
  statusCode: 400 | 401 | 403 | 409;
};

export type WeighbridgeIngestResult = WeighbridgeIngestSuccess | WeighbridgeIngestFailure;

const ARRIVED_OR_LATER = new Set(["ARRIVED", "LOADED", "IN_TRANSIT", "DELIVERED", "VERIFIED"]);

function parseCapturedAt(raw: string): Date | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function missionAllowsReading(missionStatus: string, readingType: AgentReadingType, ticketStatus: WeighbridgeTicketStatus): boolean {
  if (readingType === "empty") {
    return ARRIVED_OR_LATER.has(missionStatus) && ticketStatus === "PENDING_EMPTY";
  }
  return ticketStatus === "EMPTY_REGISTERED";
}

export async function ingest(params: WeighbridgeIngestInput): Promise<WeighbridgeIngestResult> {
  const bridge = validateWeighbridgeApiKey(params.weighbridge_id, params.apiKey);
  if (!bridge) {
    return { ok: false, reason: "invalid_weighbridge_key", statusCode: 401 };
  }

  const capturedAt = parseCapturedAt(params.captured_at);
  if (!capturedAt) {
    return { ok: false, reason: "invalid_captured_at", statusCode: 400 };
  }

  if (params.weight_kg <= 0) {
    return { ok: false, reason: "invalid_weight", statusCode: 400 };
  }

  const existing = await weighbridgeRepo.findAgentIngest({
    weighbridge_id: params.weighbridge_id,
    captured_at: capturedAt,
    reading_type: params.reading_type,
  });
  if (existing) {
    const ticket = await weighbridgeRepo.getTicketById(existing.ticket_id);
    return {
      ok: true,
      ticket_id: existing.ticket_id,
      ticket_status: ticket?.status ?? "PENDING_EMPTY",
      idempotent: true,
    };
  }

  const missionRow = await missionsRepo.getMissionById(params.mission_id);
  if (!missionRow) {
    return { ok: false, reason: "mission_not_found", statusCode: 400 };
  }

  const loadRow = await loadsRepo.getLoadById(missionRow.load_id);
  if (!loadRow) {
    return { ok: false, reason: "load_missing", statusCode: 400 };
  }

  if (loadRow.mine_id !== bridge.mine_id) {
    return { ok: false, reason: "mine_mismatch", statusCode: 403 };
  }

  let ticketRow = await weighbridgeRepo.getTicketByMissionId(params.mission_id);
  if (!ticketRow) {
    if (params.reading_type !== "empty" || !ARRIVED_OR_LATER.has(missionRow.status)) {
      return { ok: false, reason: "ticket_required", statusCode: 409 };
    }
    ticketRow = await weighbridgeRepo.createTicket({
      mission_id: params.mission_id,
      ticket_number: `WB-${params.mission_id}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    });
  }

  if (ticketRow.entry_source === "MANUAL") {
    return { ok: false, reason: "manual_entry_locked", statusCode: 409 };
  }

  if (!missionAllowsReading(missionRow.status, params.reading_type, ticketRow.status)) {
    return { ok: false, reason: "invalid_state_for_reading", statusCode: 409 };
  }

  if (params.reading_type === "loaded") {
    const emptyWeight = ticketRow.empty_weight;
    if (emptyWeight <= 0) {
      return { ok: false, reason: "empty_weight_required", statusCode: 409 };
    }
    if (params.weight_kg <= emptyWeight) {
      return { ok: false, reason: "invalid_weight_order", statusCode: 400 };
    }
  }

  const quantityTons = loadRow.quantity_tons ?? 0;
  let nextStatus: WeighbridgeTicketStatus;
  let emptyWeight = ticketRow.empty_weight;
  let loadedWeight = ticketRow.loaded_weight;
  let netWeight = ticketRow.net_weight;

  if (params.reading_type === "empty") {
    emptyWeight = params.weight_kg;
    nextStatus = "EMPTY_REGISTERED";
  } else {
    loadedWeight = params.weight_kg;
    netWeight = loadedWeight - emptyWeight;
    const anomalyCheck = await isWeighbridgeAnomaly({
      empty_weight: emptyWeight,
      loaded_weight: loadedWeight,
      quantity_tons: quantityTons,
      mineId: loadRow.mine_id,
    });
    nextStatus = anomalyCheck.anomaly ? "PENDING_HOLD" : "LOADED_REGISTERED";
  }

  const entryNote = [
    params.plate ? `plate=${params.plate}` : null,
    `captured_at=${params.captured_at}`,
    params.signature ? `signature=${params.signature.slice(0, 16)}…` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const updated = await prisma.$transaction(async (tx) => {
    const dup = await weighbridgeRepo.findAgentIngest(
      {
        weighbridge_id: params.weighbridge_id,
        captured_at: capturedAt,
        reading_type: params.reading_type,
      },
      tx,
    );
    if (dup) return { idempotent: true as const, ticketId: dup.ticket_id };

    await weighbridgeRepo.createAgentIngest(
      {
        weighbridge_id: params.weighbridge_id,
        mission_id: params.mission_id,
        reading_type: params.reading_type,
        weight_kg: params.weight_kg,
        captured_at: capturedAt,
        plate: params.plate,
        signature: params.signature,
        ticket_id: ticketRow!.id,
      },
      tx,
    );

    const ticket = await weighbridgeRepo.updateTicket(
      ticketRow!.id,
      {
        status: nextStatus,
        empty_weight: emptyWeight,
        loaded_weight: loadedWeight,
        net_weight: netWeight,
        entry_source: "AGENT",
        entry_note: entryNote || null,
      },
      tx,
    );
    if (!ticket) throw new Error("ticket_update_failed");
    return { idempotent: false as const, ticketId: ticket.id, ticketStatus: ticket.status };
  });

  if (updated.idempotent) {
    const ticket = await weighbridgeRepo.getTicketById(updated.ticketId);
    return {
      ok: true,
      ticket_id: updated.ticketId,
      ticket_status: ticket?.status ?? nextStatus,
      idempotent: true,
    };
  }

  await publishEvent("weighbridge.agent_ingest", {
    ticket_id: updated.ticketId,
    mission_id: params.mission_id,
    weighbridge_id: params.weighbridge_id,
    reading_type: params.reading_type,
    weight_kg: params.weight_kg,
    captured_at: params.captured_at,
    plate: params.plate,
    entry_source: "AGENT",
  });

  return {
    ok: true,
    ticket_id: updated.ticketId,
    ticket_status: updated.ticketStatus!,
    idempotent: false,
  };
}
