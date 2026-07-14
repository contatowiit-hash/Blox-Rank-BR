import { adminErrorResponse } from "@/app/lib/auth/http";
import { assertSameOriginAdminRequest, assertUuid } from "@/app/lib/auth/policy";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOriginAdminRequest(request);
    const id = assertUuid((await context.params).id);
    return await proxyAdminRequest(request, `/api/torneios/${id}/gerar-chaveamento`, {
      method: "POST",
      mutation: true,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
