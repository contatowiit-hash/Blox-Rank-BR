import "server-only";
import { loadAdminServerConfig, type AdminServerConfig } from "./config";
import { adminJson, unauthorizedResponse } from "./http";
import { assertSameOriginAdminRequest } from "./policy";
import { readAdminSession } from "./session";

const UPSTREAM_TIMEOUT_MS = 15_000;
const MAXIMUM_UPSTREAM_BODY_BYTES = 2 * 1024 * 1024;

export interface AdminProxyOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  mutation?: boolean;
}

export async function proxyAdminRequest(
  request: Request,
  upstreamPath: string,
  options: AdminProxyOptions = {},
): Promise<Response> {
  if (options.mutation === true) {
    assertSameOriginAdminRequest(request);
  }
  const config = loadAdminServerConfig();
  const session = await readAdminSession(request, config);
  if (session === null) {
    return unauthorizedResponse();
  }
  return proxyWithSession(config, session.actorDiscordId, upstreamPath, options);
}

async function proxyWithSession(
  config: AdminServerConfig,
  actorDiscordId: string,
  upstreamPath: string,
  options: AdminProxyOptions,
): Promise<Response> {
  if (!upstreamPath.startsWith("/api/") || upstreamPath.includes("//")) {
    throw new TypeError("Caminho de proxy administrativo inválido.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const headers = new Headers({
      Accept: "application/json",
      "X-API-Key": config.apiAdminToken,
    });
    if (options.mutation === true) {
      headers.set("X-Discord-User-Id", actorDiscordId);
    }
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const upstream = await fetch(`${config.apiBaseUrl}${upstreamPath}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      redirect: "manual",
      signal: controller.signal,
    });
    const responseBody = await upstream.text();
    if (new TextEncoder().encode(responseBody).byteLength > MAXIMUM_UPSTREAM_BODY_BYTES) {
      return adminJson(
        { error: { code: "ADMIN_UPSTREAM_ERROR", message: "Resposta administrativa inválida." } },
        502,
      );
    }
    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return adminJson(
        { error: { code: "ADMIN_UPSTREAM_ERROR", message: "Resposta administrativa inválida." } },
        502,
      );
    }
    try {
      return adminJson(JSON.parse(responseBody), upstream.status);
    } catch {
      return adminJson(
        { error: { code: "ADMIN_UPSTREAM_ERROR", message: "Resposta administrativa inválida." } },
        502,
      );
    }
  } catch {
    return adminJson(
      { error: { code: "ADMIN_UPSTREAM_UNAVAILABLE", message: "Sistema administrativo indisponível." } },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
