const PRODUCTION_HOSTS = new Set([
  "hamsahman.ir",
  "www.hamsahman.ir",
  "sahman.ir",
  "www.sahman.ir",
  "panel.sahman.ir",
  "api.sahman.ir",
]);

export function hostIsProduction(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(h)) return true;
  return h.endsWith(".sahman.ir") || h.endsWith(".hamsahman.ir");
}

/** API root — always same-origin /api on production domain (avoids mixed-content / wrong IP in old builds). */
export function resolveApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || "http://localhost:4000/api";

  if (typeof window === "undefined") return envBase;

  const { hostname, protocol } = window.location;
  if (hostIsProduction(hostname)) return "/api";

  // HTTPS page must not call HTTP API on another host (browser blocks → "Failed to fetch").
  if (protocol === "https:" && envBase.startsWith("http://")) {
    try {
      const target = new URL(envBase, window.location.origin);
      if (target.hostname !== hostname) return "/api";
    } catch {
      return "/api";
    }
  }

  return envBase;
}
