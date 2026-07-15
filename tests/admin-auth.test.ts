import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

import {
  createAdminSessionToken,
  hashAdminPassword,
  hashAdminPasswordWithSecret,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/app/lib/auth/crypto";

const ADMIN_PASSWORD = "uma-senha-administrativa-forte";
const ACTOR_ID = "123456789012345678";
const SESSION_SECRET = "session-secret-32-bytes-minimum-random-value";
let passwordHash = "";

beforeAll(async () => {
  passwordHash = await hashAdminPasswordWithSecret(ADMIN_PASSWORD, SESSION_SECRET);
});

function configureEnvironment(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_PASSWORD_HASH", passwordHash);
  vi.stubEnv("ADMIN_DISCORD_ID", ACTOR_ID);
  vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("API_BASE_URL", "https://api.example.com");
  vi.stubEnv("API_ADMIN_TOKEN", "backend-admin-token-with-at-least-32-characters");
}

describe("autenticação administrativa", () => {
  it("verifica PBKDF2 e rejeita senha ou hash alterados", async () => {
    const legacyHash = await hashAdminPassword(ADMIN_PASSWORD);
    expect(legacyHash).toMatch(/^pbkdf2-sha256\$310000\$/u);
    await expect(verifyAdminPassword(ADMIN_PASSWORD, legacyHash)).resolves.toBe(true);
    await expect(verifyAdminPassword("senha-incorreta", legacyHash)).resolves.toBe(false);
  });

  it("verifica HMAC com segredo do servidor e rejeita senha, hash ou segredo alterados", async () => {
    expect(passwordHash).toMatch(/^hmac-sha256\$/u);
    await expect(
      verifyAdminPassword(ADMIN_PASSWORD, passwordHash, SESSION_SECRET),
    ).resolves.toBe(true);
    await expect(
      verifyAdminPassword("senha-incorreta", passwordHash, SESSION_SECRET),
    ).resolves.toBe(false);
    await expect(
      verifyAdminPassword(ADMIN_PASSWORD, `${passwordHash}x`, SESSION_SECRET),
    ).resolves.toBe(false);
    await expect(
      verifyAdminPassword(ADMIN_PASSWORD, passwordHash, `${SESSION_SECRET}-alterado`),
    ).resolves.toBe(false);
  });

  it("assina ator e expiração e rejeita token adulterado ou expirado", async () => {
    const now = 1_800_000_000;
    const { token, payload } = await createAdminSessionToken(ACTOR_ID, SESSION_SECRET, now);
    await expect(verifyAdminSessionToken(token, SESSION_SECRET, now + 10)).resolves.toMatchObject({
      actorDiscordId: ACTOR_ID,
      issuedAt: now,
      expiresAt: payload.expiresAt,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    await expect(verifyAdminSessionToken(tampered, SESSION_SECRET, now + 10)).resolves.toBeNull();
    await expect(
      verifyAdminSessionToken(token, SESSION_SECRET, payload.expiresAt),
    ).resolves.toBeNull();
  });

  it("cria cookie HttpOnly/Strict/Secure e permite consultar a sessão", async () => {
    configureEnvironment();
    const { POST } = await import("@/app/api/admin/login/route");
    const login = await POST(
      new Request("https://admin.example.com/api/admin/login", {
        method: "POST",
        headers: { Origin: "https://admin.example.com", "Content-Type": "application/json" },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
      }),
    );

    expect(login.status).toBe(200);
    expect(
      Object.prototype.hasOwnProperty.call(globalThis, "__bloxRankAdminLoginRateLimit"),
    ).toBe(false);
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-blox_rank_admin_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
    expect(JSON.stringify(await login.json())).not.toContain(ADMIN_PASSWORD);

    const { GET } = await import("@/app/api/admin/session/route");
    const session = await GET(
      new Request("https://admin.example.com/api/admin/session", {
        headers: { Cookie: setCookie.split(";", 1)[0] ?? "" },
      }),
    );
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      authenticated: true,
      actor_discord_id: ACTOR_ID,
    });
  });

  it("bloqueia login cross-origin antes de validar credenciais", async () => {
    configureEnvironment();
    const { POST } = await import("@/app/api/admin/login/route");
    const response = await POST(
      new Request("https://admin.example.com/api/admin/login", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(ADMIN_PASSWORD);
  });
});
