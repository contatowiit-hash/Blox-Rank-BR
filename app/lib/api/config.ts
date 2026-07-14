import { ApiConfigurationError } from "./errors";
import type { PublicSocialConfig } from "./types";
import { serverEnvironment } from "../runtime-env.server";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolveApiBaseUrl(value: string | undefined = serverEnvironment.API_BASE_URL): string {
  const configured = value?.trim();
  if (configured === undefined || configured.length === 0) {
    throw new ApiConfigurationError();
  }

  try {
    const url = new URL(configured);
    const allowedProtocol =
      url.protocol === "https:" || (url.protocol === "http:" && isLocalHostname(url.hostname));
    const onlyOrigin =
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";
    if (!allowedProtocol || !onlyOrigin) {
      throw new Error("invalid API origin");
    }
    return url.origin;
  } catch {
    throw new ApiConfigurationError();
  }
}

function optionalHttpsUrl(value: string | undefined): string | null {
  const configured = value?.trim();
  if (configured === undefined || configured.length === 0) {
    return null;
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
      throw new Error("invalid public URL");
    }
    return url.toString();
  } catch {
    throw new ApiConfigurationError();
  }
}

export function readPublicSocialConfig(
  environment: Readonly<Record<string, string | undefined>> = serverEnvironment,
): PublicSocialConfig {
  return {
    discord_url: optionalHttpsUrl(environment.PUBLIC_DISCORD_URL),
    tiktok_url: optionalHttpsUrl(environment.PUBLIC_TIKTOK_URL),
    youtube_url: optionalHttpsUrl(environment.PUBLIC_YOUTUBE_URL),
  };
}
