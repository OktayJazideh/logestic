import React from "react";
import { Button } from "../ui/Button";
import { brand, radius, space } from "../../theme";

type Props = {
  message: string;
  /** یک خط راهنما — «چکار کنم؟» */
  actionHint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
};

export function ErrorBanner({
  message,
  actionHint,
  onRetry,
  retryLabel = "دوباره",
  testId = "error-banner",
}: Props) {
  return (
    <div
      className="simple-error-banner"
      role="alert"
      data-testid={testId}
      style={{
        marginBottom: space.md,
        padding: space.md,
        borderRadius: radius.md,
        background: brand.dangerBg,
        border: `1px solid ${brand.dangerBorder}`,
        color: brand.danger,
        fontSize: 16,
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 600 }}>{message}</div>
      {actionHint && (
        <div style={{ marginTop: 8, fontSize: 14, color: brand.text }}>
          <strong>چکار کنم؟</strong> {actionHint}
        </div>
      )}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={onRetry} style={{ minHeight: 44 }}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
