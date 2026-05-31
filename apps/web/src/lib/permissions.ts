/** Mirrors backend permission matching (types/permissions.ts). */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}

export function hasAnyPermission(granted: string[], required: string | string[]): boolean {
  const reqs = Array.isArray(required) ? required : [required];
  return reqs.some((req) => granted.some((g) => permissionMatches(g, req)));
}
