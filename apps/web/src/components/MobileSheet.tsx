import React, { useEffect } from "react";
import { Button } from "./ui";
import { brand, radius, shadow } from "../theme";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Full-screen sheet on mobile for forms */
export function MobileSheet({ title, open, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="mobile-sheet"
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(21, 41, 33, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="mobile-sheet__panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflow: "auto",
          background: brand.panel,
          borderRadius: `${radius.xl} ${radius.xl} 0 0`,
          boxShadow: shadow.lg,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: brand.primaryDark }}>{title}</h2>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="بستن">
            ✕
          </Button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
