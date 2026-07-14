import { adminErrorResponse, readJsonBody } from "@/app/lib/auth/http";
import {
  assertSameOriginAdminRequest,
  assertUuid,
  parseRegistrationStatusBody,
} from "@/app/lib/auth/policy";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOriginAdminRequest(request);
    const id = assertUuid((await context.params).id);
    const body = parseRegistrationStatusBody(await readJsonBody(request));
    return await proxyAdminRequest(request, `/api/inscricoes/${id}/status`, {
      method: "PATCH",
      body,
      mutation: true,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
