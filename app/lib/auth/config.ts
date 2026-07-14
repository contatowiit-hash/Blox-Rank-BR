import "server-only";
import { isSupportedAdminPasswordHash } from "./crypto";
import { serverEnvironment } from "../runtime-env.server";

export class AdminConfigurationError extends Error {
  public constructor() {
    super("A autenticação administrativa não está configurada.");
    this.name = "AdminConfigurationError";
  }
}

export interface AdminServerConfig {
  passwordHash: string;
  adminDiscordId: string;
  sessionSecret: string;
  apiBaseUrl: string;
  apiAdminToken: string;
  production: boolean;
}

function requiredSecret(value: string | undefined, minimumLength: number): string {
  const normalized = value?.trim();
  if (
    normalized === undefined ||
    normalized.length < minimumLength ||
    /replace|change-me|example|password/i.test(normalized)
  ) {
    throw new AdminConfigurationError();
  }
  return normalized;
}

function normalizedApiBaseUrl(value: string | undefined): string {
  if (value === undefined) {
    throw new AdminConfigurationError();
  }
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      throw new AdminConfigurationError();
    }
    return url.origin;
  } catch (error) {
    if (error instanceof AdminConfigurationError) {
      throw error;
    }
    throw new AdminConfigurationError();
  }
}

export function loadAdminServerConfig(
  source: Readonly<Record<string, string | undefined>> = serverEnvironment,
): AdminServerConfig {
  const passwordHash = source.ADMIN_PASSWORD_HASH?.trim();
  if (passwordHash === undefined || !isSupportedAdminPasswordHash(passwordHash)) {
    throw new AdminConfigurationError();
  }
  const adminDiscordId = source.ADMIN_DISCORD_ID?.trim();
  if (adminDiscordId === undefined || !/^\d{17,20}$/u.test(adminDiscordId)) {
    throw new AdminConfigurationError();
  }

  return {
    passwordHash,
    adminDiscordId,
    sessionSecret: requiredSecret(source.SESSION_SECRET, 32),
    apiBaseUrl: normalizedApiBaseUrl(source.API_BASE_URL),
    apiAdminToken: requiredSecret(source.API_ADMIN_TOKEN, 32),
    production: source.NODE_ENV === "production",
  };
}
