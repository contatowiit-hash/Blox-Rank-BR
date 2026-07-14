import { adminErrorResponse, readJsonBody } from "@/app/lib/auth/http";
import {
  assertSameOriginAdminRequest,
  assertUuid,
  parseMatchResultBody,
} from "@/app/lib/auth/policy";
import { proxyAdminRequest } from "@/app/lib/auth/proxy";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOriginAdminRequest(request);
    const id = assertUuid((await context.params).id);
    const body = parseMatchResultBody(await readJsonBody(request));
    return await proxyAdminRequest(request, `/api/partidas/${id}/resultado`, {
      method: "POST",
      body,
      mutation: true,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
