import { adminErrorResponse } from "@/app/lib/auth/http";
import { assertUuid } from "@/app/lib/auth/policy";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const id = assertUuid((await context.params).id);
    return await proxyAdminRequest(request, `/api/inscricoes/${id}`);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
