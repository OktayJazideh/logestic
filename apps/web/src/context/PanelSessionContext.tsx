import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type PanelSessionValue = {
  tokenVersion: number;
  bumpSession: () => void;
};

const PanelSessionContext = createContext<PanelSessionValue | null>(null);

export function PanelSessionProvider({ children }: { children: React.ReactNode }) {
  const [tokenVersion, setTokenVersion] = useState(0);
  const bumpSession = useCallback(() => setTokenVersion((v) => v + 1), []);
  const value = useMemo(() => ({ tokenVersion, bumpSession }), [tokenVersion, bumpSession]);
  return <PanelSessionContext.Provider value={value}>{children}</PanelSessionContext.Provider>;
}

export function usePanelSession() {
  const ctx = useContext(PanelSessionContext);
  if (!ctx) {
    return { tokenVersion: 0, bumpSession: () => undefined };
  }
  return ctx;
}
