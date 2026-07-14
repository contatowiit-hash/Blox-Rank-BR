import { createAdminApiClient } from "@/app/lib/api/admin-client.server";
import {
  createPublicApiClient,
  publicErrorResponse,
  sanitizeApprovedParticipants,
} from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const tournament = await createPublicApiClient().getCurrentTournament();
    const registrations = await createAdminApiClient().listApprovedRegistrations(tournament.id);
    const participants = sanitizeApprovedParticipants(registrations.data, tournament.id);
    return Response.json(
      { data: participants },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(error, { hideUpstreamAuthorization: true });
  }
}
