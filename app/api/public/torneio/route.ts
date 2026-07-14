import { createPublicApiClient, publicErrorResponse } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const tournament = await createPublicApiClient().getCurrentTournament();
    return Response.json(
      { data: tournament },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}
