import React from "react";

export type HomeIconKey =
  | "ops"
  | "weighbridge"
  | "dispatch"
  | "employer"
  | "kyc"
  | "settlement"
  | "wallet"
  | "finance"
  | "users"
  | "approvals"
  | "coop"
  | "missions"
  | "default";

type Props = { iconKey: HomeIconKey; size?: number };

const paths: Record<HomeIconKey, React.ReactNode> = {
  ops: (
    <path
      fill="currentColor"
      d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
    />
  ),
  weighbridge: (
    <path
      fill="currentColor"
      d="M3 18h18v2H3v-2zm2-3 4-8 4 4 4-4 4 4-4-8-4-4zm1 0 3-6 3 6H6z"
    />
  ),
  dispatch: (
    <path fill="currentColor" d="M3 6h12v2H3V6zm0 5h18v2H3v-2zm0 5h8v2H3v-2z" />
  ),
  employer: (
    <path fill="currentColor" d="M12 3L2 9v12h20V9L12 3zm0 2.2L18 9H6l6-3.8zM4 11h16v8H4v-8z" />
  ),
  kyc: (
    <path
      fill="currentColor"
      d="M12 12a4 4 0 100-8 4 4 0 000 8zm-8 8v-1.5c0-2.5 5-3.9 8-3.9s8 1.4 8 3.9V20H4z"
    />
  ),
  settlement: (
    <path fill="currentColor" d="M4 4h16v2H4V4zm2 4h12v2H6V8zm-2 4h16v2H4v-2zm2 4h12v2H6v-2z" />
  ),
  wallet: (
    <path
      fill="currentColor"
      d="M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zm0 4v6h16v-6H4zm14 2h2v2h-2v-2z"
    />
  ),
  finance: (
    <path fill="currentColor" d="M4 18V6h16v12H4zm2-2h12V8H6v8zm2-4h2v4H8v-4zm4 0h2v4h-2v-4z" />
  ),
  users: (
    <path
      fill="currentColor"
      d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 13a3 3 0 100-6 3 3 0 000 6zm8 2c2.7 0 5 1.3 5 3v2H15v-2c0-1.1.8-2.1 2-2.6-1.2-.4-2.5-.4-4 0-1.2.5-2 .9-2 2.6v2H3v-2c0-1.7 2.3-3 5-3 1.5 0 2.8.3 4 .8 1.2-.5 2.5-.8 4-.8z"
    />
  ),
  approvals: (
    <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
  ),
  coop: (
    <path fill="currentColor" d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18 8v6.5l-6 3-6-3V8l6-3.5z" />
  ),
  missions: (
    <path fill="currentColor" d="M6 2h12v2H6V2zm-2 4h16v14H4V6zm2 2v10h12V8H6z" />
  ),
  default: (
    <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v5h4v2h-6V7h2z" />
  ),
};

export function PanelHomeIcon({ iconKey, size = 24 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {paths[iconKey] ?? paths.default}
    </svg>
  );
}
