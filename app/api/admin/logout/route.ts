import { loadAdminServerConfig } from "@/app/lib/auth/config";
import { adminErrorResponse, adminJson } from "@/app/lib/auth/http";
import { assertSameOriginAdminRequest } from "@/app/lib/auth/policy";
import { clearSessionCookie } from "@/app/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginAdminRequest(request);
    const config = loadAdminServerConfig();
    return adminJson(
      { authenticated: false },
      200,
      { "Set-Cookie": clearSessionCookie(config) },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
