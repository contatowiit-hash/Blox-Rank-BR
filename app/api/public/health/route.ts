import { createPublicApiClient, publicErrorResponse } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const result = await createPublicApiClient().getHealth();
    return Response.json(result.health, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return publicErrorResponse(error);
  }
}
