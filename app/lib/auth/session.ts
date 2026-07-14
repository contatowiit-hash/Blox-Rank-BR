import "server-only";
import type { AdminServerConfig } from "./config";
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  type AdminSessionPayload,
  verifyAdminSessionToken,
} from "./crypto";

const DEVELOPMENT_COOKIE_NAME = "blox_rank_admin_session";
const PRODUCTION_COOKIE_NAME = "__Host-blox_rank_admin_session";

function cookieName(production: boolean): string {
  return production ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name !== "" && !cookies.has(name)) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function cookieAttributes(production: boolean): string[] {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(production ? ["Secure"] : []),
  ];
}

export async function createSessionCookie(
  actorDiscordId: string,
  config: AdminServerConfig,
): Promise<{ cookie: string; session: AdminSessionPayload }> {
  const { token, payload } = await createAdminSessionToken(
    actorDiscordId,
    config.sessionSecret,
  );
  const attributes = cookieAttributes(config.production);
  return {
    cookie: [
      `${cookieName(config.production)}=${token}`,
      ...attributes,
      `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
      `Expires=${new Date(payload.expiresAt * 1_000).toUTCString()}`,
    ].join("; "),
    session: payload,
  };
}

export function clearSessionCookie(config: AdminServerConfig): string {
  return [
    `${cookieName(config.production)}=`,
    ...cookieAttributes(config.production),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export async function readAdminSession(
  request: Request,
  config: AdminServerConfig,
): Promise<AdminSessionPayload | null> {
  const token = parseCookies(request.headers.get("cookie")).get(cookieName(config.production));
  if (token === undefined) {
    return null;
  }
  return verifyAdminSessionToken(token, config.sessionSecret);
}
