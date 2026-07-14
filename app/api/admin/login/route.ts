import { loadAdminServerConfig } from "@/app/lib/auth/config";
import { verifyAdminPassword } from "@/app/lib/auth/crypto";
import { adminErrorResponse, adminJson, readJsonBody } from "@/app/lib/auth/http";
import { assertSameOriginAdminRequest, parseLoginBody } from "@/app/lib/auth/policy";
import {
  clearSuccessfulLogin,
  loginRateLimitKeys,
  loginRetryAfterSeconds,
  recordLoginFailure,
} from "@/app/lib/auth/rate-limit";
import { createSessionCookie } from "@/app/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginAdminRequest(request);
    const config = loadAdminServerConfig();
    const addressKeys = loginRateLimitKeys(request);
    const addressRetry = loginRetryAfterSeconds(addressKeys);
    if (addressRetry !== null) {
      return adminJson(
        { error: { code: "LOGIN_RATE_LIMITED", message: "Aguarde antes de tentar novamente." } },
        429,
        { "Retry-After": String(addressRetry) },
      );
    }

    let input: ReturnType<typeof parseLoginBody>;
    try {
      input = parseLoginBody(await readJsonBody(request));
    } catch (error) {
      recordLoginFailure(addressKeys);
      throw error;
    }
    const keys = loginRateLimitKeys(request, config.adminDiscordId);
    const retryAfter = loginRetryAfterSeconds(keys);
    if (retryAfter !== null) {
      return adminJson(
        { error: { code: "LOGIN_RATE_LIMITED", message: "Aguarde antes de tentar novamente." } },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }

    if (!(await verifyAdminPassword(input.password, config.passwordHash))) {
      recordLoginFailure(keys);
      return adminJson(
        { error: { code: "INVALID_CREDENTIALS", message: "Dados de acesso inválidos." } },
        401,
      );
    }

    clearSuccessfulLogin(keys);
    const { cookie, session } = await createSessionCookie(config.adminDiscordId, config);
    return adminJson(
      {
        authenticated: true,
        actor_discord_id: session.actorDiscordId,
        expires_at: new Date(session.expiresAt * 1_000).toISOString(),
      },
      200,
      { "Set-Cookie": cookie },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
