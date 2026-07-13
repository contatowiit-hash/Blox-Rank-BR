import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isApiKeyValid(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }
  return timingSafeEqual(digest(provided), digest(expected));
}
