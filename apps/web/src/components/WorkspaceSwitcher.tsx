import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import {
  dedupeOperationalWorkspaces,
  isAdminWorkspaceRole,
  workspaceKey,
  workspaceLabel,
} from "../lib/workspaceFlow";
import type { WorkspaceRow } from "../pages/WorkspaceSelectPage";
import { brand } from "../theme";

type Props = {
  userRole?: string;
  activeMineId?: number | null;
  tokenVersion: number;
  onWorkspaceChanged: () => void;
  compact?: boolean;
};

export function WorkspaceSwitcher({
  userRole,
  activeMineId,
  tokenVersion,
  onWorkspaceChanged,
  compact,
}: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const operationalMines = useMemo(() => dedupeOperationalWorkspaces(workspaces), [workspaces]);
  const showDropdown = operationalMines.length > 1;
  const showMineContext = Boolean(userRole) && operationalMines.length >= 1;

  const loadWorkspaces = useCallback(async () => {
    const r = await apiGetData<{ workspaces: WorkspaceRow[] }>("/workspaces");
    if (!r.ok) {
      setError(apiErrorMessageFa(r.code, r.message));
      return;
    }
    setWorkspaces(r.data.workspaces);
    setError(null);
  }, []);

  useEffect(() => {
    if (!userRole) return;
    void loadWorkspaces();
  }, [userRole, loadWorkspaces, tokenVersion]);

  const applySelection = useCallback(
    async (key: string) => {
      const ws = workspaces.find((w) => workspaceKey(w) === key);
      if (!ws) return;
      setBusy(true);
      setError(null);
      const r = await apiPostData<{ mine_id: number }>("/workspaces/select", {
        mine_id: ws.mine_id,
        membership_kind: ws.membership_kind,
        ...(ws.cooperative_id != null ? { cooperative_id: ws.cooperative_id } : {}),
      });
      setBusy(false);
      if (!r.ok) {
        setError(apiErrorMessageFa(r.code, r.message));
        return;
      }
      onWorkspaceChanged();
    },
    [workspaces, onWorkspaceChanged],
  );

  useEffect(() => {
    if (!showMineContext || operationalMines.length === 0) return;
    const match = operationalMines.find((w) => w.mine_id === activeMineId);
    if (match) {
      setChoice(workspaceKey(match));
      return;
    }
    if (operationalMines.length === 1 && activeMineId == null && isAdminWorkspaceRole(userRole)) {
      const key = workspaceKey(operationalMines[0]!);
      setChoice(key);
      void applySelection(key);
    } else if (!choice && operationalMines.length === 1) {
      setChoice(workspaceKey(operationalMines[0]!));
    }
  }, [showMineContext, operationalMines, activeMineId, choice, userRole, applySelection]);

  if (!showMineContext) return null;

  const active = operationalMines.find((w) => w.mine_id === activeMineId);
  const activeName = active ? workspaceLabel(active) : operationalMines[0] ? workspaceLabel(operationalMines[0]) : "معدن";

  if (!showDropdown) {
    return (
      <div
        className="workspace-switcher workspace-switcher--label"
        data-testid="workspace-mine-label"
        style={{
          fontSize: 13,
          color: "#fff",
          fontWeight: 600,
          padding: compact ? "8px 10px" : "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)",
          maxWidth: compact ? "100%" : 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={activeName}
      >
        {isAdminWorkspaceRole(userRole) ? "معدن: " : ""}
        {activeName}
      </div>
    );
  }

  return (
    <div
      className="workspace-switcher"
      data-testid="workspace-switcher"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: compact ? "stretch" : "flex-end",
        gap: 4,
        minWidth: 0,
        flex: compact ? "1 1 auto" : undefined,
      }}
    >
      <label
        style={{
          display: "flex",
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "center",
          gap: 6,
          fontSize: 13,
          color: "#fff",
          minWidth: 0,
        }}
      >
        {!compact && <span style={{ opacity: 0.9, flexShrink: 0 }}>معدن:</span>}
        <select
          data-testid="workspace-switcher-select"
          value={choice}
          disabled={busy}
          onChange={(e) => {
            const key = e.target.value;
            setChoice(key);
            void applySelection(key);
          }}
          title={activeName}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            minWidth: compact ? 0 : 140,
            maxWidth: compact ? "100%" : 200,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {operationalMines.map((w) => (
            <option key={workspaceKey(w)} value={workspaceKey(w)} style={{ color: brand.text }}>
              {workspaceLabel(w)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <span style={{ fontSize: 11, color: "#fecaca", maxWidth: 220, textAlign: compact ? "right" : "left" }}>
          {error}
        </span>
      )}
    </div>
  );
}
