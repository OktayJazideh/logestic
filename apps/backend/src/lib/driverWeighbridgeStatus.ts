import type { MissionPaymentState } from "../stores/missionStore";
import type { WeighbridgeTicketStatus } from "../stores/missionStore";
import type { WeighbridgeTicketRow } from "../repositories/weighbridgeRepository";

/** WF-WB-READ-1: driver read-only weighbridge snapshot. */
export type DriverWeighbridgeStatusDto = {
  ticket_status: "PENDING_EMPTY" | "EMPTY_REGISTERED" | "LOADED_REGISTERED" | "APPROVED";
  empty_weight_kg: number | null;
  loaded_weight_kg: number | null;
  net_weight_kg: number | null;
  entry_source: "AGENT" | "MANUAL" | "OPERATOR" | null;
  hold_percent: number;
  payment_hold: boolean;
  hold_reason: string | null;
};

const HOLD_PERCENT = 5;

function mapTicketStatus(raw: WeighbridgeTicketStatus): DriverWeighbridgeStatusDto["ticket_status"] {
  switch (raw) {
    case "PENDING_EMPTY":
      return "PENDING_EMPTY";
    case "EMPTY_REGISTERED":
      return "EMPTY_REGISTERED";
    case "APPROVED":
      return "APPROVED";
    case "LOADED_REGISTERED":
    case "PENDING_HOLD":
    case "ADJUSTED":
    case "REJECTED":
      return "LOADED_REGISTERED";
    default:
      return "PENDING_EMPTY";
  }
}

function weightKgOrNull(value: number | undefined): number | null {
  if (value == null || value <= 0) return null;
  return Math.round(value);
}

function resolveEntrySource(
  raw: string | null | undefined,
): DriverWeighbridgeStatusDto["entry_source"] {
  if (raw === "AGENT" || raw === "MANUAL" || raw === "OPERATOR") return raw;
  return null;
}

function resolveHoldReason(params: {
  ticket: WeighbridgeTicketRow | null;
  paymentHold: boolean;
}): string | null {
  if (!params.paymentHold) return null;
  if (params.ticket?.status === "PENDING_HOLD") {
    if (params.ticket.entry_source === "MANUAL") {
      return params.ticket.entry_note ?? "ثبت دستی — در انتظار تأیید ناظر";
    }
    return "انحراف وزن از برنامه بار — در انتظار بررسی";
  }
  if (params.ticket?.requires_supervisor_approve) {
    return params.ticket.entry_note ?? "ثبت دستی — در انتظار تأیید ناظر";
  }
  if (params.ticket?.entry_note) return params.ticket.entry_note;
  return "کرایه تا پایان بررسی عملیات مسدود است";
}

export function buildDriverWeighbridgeStatus(params: {
  ticket: WeighbridgeTicketRow | null;
  payment_state: MissionPaymentState;
}): DriverWeighbridgeStatusDto {
  const ticket = params.ticket;
  if (!ticket) {
    return {
      ticket_status: "PENDING_EMPTY",
      empty_weight_kg: null,
      loaded_weight_kg: null,
      net_weight_kg: null,
      entry_source: null,
      hold_percent: HOLD_PERCENT,
      payment_hold: params.payment_state === "HELD",
      hold_reason: params.payment_state === "HELD" ? resolveHoldReason({ ticket: null, paymentHold: true }) : null,
    };
  }

  const ticketStatus = mapTicketStatus(ticket.status);
  const emptyRegistered =
    ticket.status !== "PENDING_EMPTY" && ticket.empty_weight > 0;
  const loadedRegistered =
    ticket.status === "LOADED_REGISTERED" ||
    ticket.status === "PENDING_HOLD" ||
    ticket.status === "APPROVED" ||
    ticket.status === "ADJUSTED" ||
    ticket.status === "REJECTED" ||
    (ticket.loaded_weight > 0 && ticket.empty_weight > 0);

  const paymentHold =
    params.payment_state === "HELD" ||
    ticket.status === "PENDING_HOLD" ||
    (ticket.requires_supervisor_approve && ticket.status !== "APPROVED");

  const netApproved =
    ticket.status === "APPROVED" || ticket.status === "ADJUSTED";

  return {
    ticket_status: ticketStatus,
    empty_weight_kg: emptyRegistered ? weightKgOrNull(ticket.empty_weight) : null,
    loaded_weight_kg: loadedRegistered ? weightKgOrNull(ticket.loaded_weight) : null,
    net_weight_kg: netApproved ? weightKgOrNull(ticket.net_weight) : null,
    entry_source: resolveEntrySource(ticket.entry_source),
    hold_percent: HOLD_PERCENT,
    payment_hold: paymentHold,
    hold_reason: resolveHoldReason({ ticket, paymentHold }),
  };
}
