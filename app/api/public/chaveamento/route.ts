import { createPublicApiClient, publicErrorResponse } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const bracket = await createPublicApiClient().getCurrentBracket();
    return Response.json(
      { data: bracket },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}
