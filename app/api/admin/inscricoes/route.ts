import { adminErrorResponse } from "@/app/lib/auth/http";
import { buildRegistrationQuery } from "@/app/lib/auth/policy";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = buildRegistrationQuery(new URL(request.url).searchParams);
    return await proxyAdminRequest(request, `/api/inscricoes${query}`);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
