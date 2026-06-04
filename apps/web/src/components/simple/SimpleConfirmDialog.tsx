import React, { useEffect, useId } from "react";
import { Button } from "../ui/Button";
import { brand, radius, shadow, space } from "../../theme";

type Props = {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SimpleConfirmDialog({
  open,
  title = "مطمئنید؟",
  message,
  confirmLabel = "بله، انجام بده",
  cancelLabel = "انصراف",
  confirmVariant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="simple-confirm-backdrop"
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(21, 41, 33, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="simple-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: brand.panel,
          borderRadius: radius.lg,
          boxShadow: shadow.lg,
          padding: space.lg,
          border: `1px solid ${brand.border}`,
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: `0 0 ${space.sm}px`,
            fontSize: 20,
            fontWeight: 700,
            color: brand.primaryDark,
          }}
        >
          {title}
        </h2>
        <div style={{ fontSize: 16, lineHeight: 1.65, color: brand.text, marginBottom: space.lg }}>{message}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? "در حال انجام…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
