import { loadAdminServerConfig } from "@/app/lib/auth/config";
import { adminErrorResponse, adminJson } from "@/app/lib/auth/http";
import { clearSessionCookie, readAdminSession } from "@/app/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = loadAdminServerConfig();
    const session = await readAdminSession(request, config);
    if (session === null) {
      return adminJson(
        { authenticated: false },
        200,
        { "Set-Cookie": clearSessionCookie(config) },
      );
    }
    return adminJson({
      authenticated: true,
      actor_discord_id: session.actorDiscordId,
      expires_at: new Date(session.expiresAt * 1_000).toISOString(),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
