import { publicErrorResponse, readPublicSocialConfig } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const config = readPublicSocialConfig();
    return Response.json(
      { data: config },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}
