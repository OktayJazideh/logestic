import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetData, apiPostData } from "../api";
import { apiErrorMessageFa } from "../lib/apiErrorsFa";
import { brand } from "../theme";

export type WorkspaceRow = {
  membership_kind: "COMMUNITY" | "OPERATIONAL";
  mine_id: number;
  mine_name: string;
  cooperative_id?: number;
  subtitle: string;
  roles: string[];
};

const GLOBAL_WORKSPACE_ROLES = new Set(["ADMIN", "OPERATION_ADMIN"]);

type Props = {
  userRole?: string;
  activeMineId?: number | null;
  tokenVersion: number;
  onWorkspaceChanged: () => void;
  compact?: boolean;
};

function workspaceKey(w: WorkspaceRow) {
  return `${w.membership_kind}:${w.mine_id}:${w.cooperative_id ?? 0}`;
}

function workspaceLabel(w: WorkspaceRow) {
  if (w.membership_kind === "COMMUNITY") {
    return w.subtitle || w.mine_name;
  }
  return w.mine_name || w.subtitle;
}

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

  const showSwitcher = Boolean(userRole && GLOBAL_WORKSPACE_ROLES.has(userRole));

  const operationalMines = useMemo(() => {
    const seen = new Set<number>();
    const rows: WorkspaceRow[] = [];
    for (const w of workspaces) {
      if (w.membership_kind !== "OPERATIONAL") continue;
      if (seen.has(w.mine_id)) continue;
      seen.add(w.mine_id);
      rows.push(w);
    }
    return rows;
  }, [workspaces]);

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
    if (!showSwitcher) return;
    void loadWorkspaces();
  }, [showSwitcher, loadWorkspaces, tokenVersion]);

  useEffect(() => {
    if (!showSwitcher || operationalMines.length === 0) return;
    const match = operationalMines.find((w) => w.mine_id === activeMineId);
    if (match) {
      setChoice(workspaceKey(match));
      return;
    }
    if (operationalMines.length === 1 && activeMineId == null) {
      const key = workspaceKey(operationalMines[0]!);
      setChoice(key);
      void applySelection(key);
    } else if (!choice && operationalMines.length === 1) {
      setChoice(workspaceKey(operationalMines[0]!));
    }
  }, [showSwitcher, operationalMines, activeMineId, choice]);

  async function applySelection(key: string) {
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
  }

  if (!showSwitcher || operationalMines.length === 0) return null;

  const active = operationalMines.find((w) => w.mine_id === activeMineId);
  const activeName = active ? workspaceLabel(active) : "انتخاب معدن";

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
          disabled={busy || operationalMines.length < 2}
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
            cursor: operationalMines.length < 2 ? "default" : "pointer",
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
