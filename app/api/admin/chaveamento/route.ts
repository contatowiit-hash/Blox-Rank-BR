import { adminErrorResponse } from "@/app/lib/auth/http";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

export async function GET(request: Request): Promise<Response> {
  try {
    return await proxyAdminRequest(request, "/api/torneios/atual/chaveamento");
  } catch (error) {
    return adminErrorResponse(error);
  }
}
