import { describe, expect, it } from "vitest";
import { newIdempotencyKey } from "./idempotencyKey";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("newIdempotencyKey", () => {
  it("returns a UUID v4 string", () => {
    expect(newIdempotencyKey()).toMatch(UUID_RE);
  });

  it("uses getRandomValues fallback when randomUUID is unavailable", () => {
    const orig = globalThis.crypto?.randomUUID;
    if (globalThis.crypto) {
      // @ts-expect-error test override
      delete globalThis.crypto.randomUUID;
    }
    try {
      expect(newIdempotencyKey()).toMatch(UUID_RE);
    } finally {
      if (globalThis.crypto && orig) {
        globalThis.crypto.randomUUID = orig;
      }
    }
  });
});
