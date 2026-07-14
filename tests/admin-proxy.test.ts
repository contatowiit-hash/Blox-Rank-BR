import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

import { createAdminSessionToken, hashAdminPassword } from "@/app/lib/auth/crypto";

const SESSION_ACTOR_ID = "123456789012345678";
const FORGED_ACTOR_ID = "999999999999999999";
const SESSION_SECRET = "another-session-secret-with-32-random-characters";
const API_ADMIN_TOKEN = "backend-api-token-with-at-least-32-characters";
const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
let sessionCookie = "";

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_PASSWORD_HASH", await hashAdminPassword("outra-senha-administrativa-forte"));
  vi.stubEnv("ADMIN_DISCORD_ID", SESSION_ACTOR_ID);
  vi.stubEnv("SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("API_BASE_URL", "https://api.example.com");
  vi.stubEnv("API_ADMIN_TOKEN", API_ADMIN_TOKEN);
  const { token } = await createAdminSessionToken(SESSION_ACTOR_ID, SESSION_SECRET);
  sessionCookie = `__Host-blox_rank_admin_session=${token}`;
});

describe("proxy administrativo", () => {
  it("mantém a chave no servidor e usa sempre o ator assinado na sessão", async () => {
    const upstreamFetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({ data: { id: REGISTRATION_ID, status: "approved" } });
      },
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const { PATCH } = await import("@/app/api/admin/inscricoes/[id]/status/route");
    const response = await PATCH(
      new Request(`https://admin.example.com/api/admin/inscricoes/${REGISTRATION_ID}/status`, {
        method: "PATCH",
        headers: {
          Origin: "https://admin.example.com",
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ status: "approved", actor_discord_id: FORGED_ACTOR_ID }),
      }),
      { params: Promise.resolve({ id: REGISTRATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [url, options] = upstreamFetch.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.example.com/api/inscricoes/${REGISTRATION_ID}/status`);
    const headers = new Headers(options?.headers);
    expect(headers.get("X-API-Key")).toBe(API_ADMIN_TOKEN);
    expect(headers.get("X-Discord-User-Id")).toBe(SESSION_ACTOR_ID);
    expect(options?.body).toBe(JSON.stringify({ status: "approved" }));
    const browserPayload = JSON.stringify(await response.json());
    expect(browserPayload).not.toContain(API_ADMIN_TOKEN);
    expect(browserPayload).not.toContain(SESSION_SECRET);
  });

  it("não chama o backend sem sessão nem em mutação cross-origin", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const listRoute = await import("@/app/api/admin/inscricoes/route");
    const unauthenticated = await listRoute.GET(
      new Request("https://admin.example.com/api/admin/inscricoes"),
    );
    expect(unauthenticated.status).toBe(401);

    const statusRoute = await import("@/app/api/admin/inscricoes/[id]/status/route");
    const crossOrigin = await statusRoute.PATCH(
      new Request(`https://admin.example.com/api/admin/inscricoes/${REGISTRATION_ID}/status`, {
        method: "PATCH",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ status: "approved" }),
      }),
      { params: Promise.resolve({ id: REGISTRATION_ID }) },
    );
    expect(crossOrigin.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("valida a allowlist de query e não repassa respostas não JSON", async () => {
    const listRoute = await import("@/app/api/admin/inscricoes/route");
    const invalidQuery = await listRoute.GET(
      new Request("https://admin.example.com/api/admin/inscricoes?redirect=https://evil.example", {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(invalidQuery.status).toBe(400);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro interno sensível", { status: 500, headers: { "Content-Type": "text/html" } })),
    );
    const upstreamFailure = await listRoute.GET(
      new Request("https://admin.example.com/api/admin/inscricoes", {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(upstreamFailure.status).toBe(502);
    expect(await upstreamFailure.text()).not.toContain("erro interno sensível");
  });
});
