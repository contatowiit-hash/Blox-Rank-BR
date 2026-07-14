import {
  ApiValidationError,
  createPublicApiClient,
  publicErrorResponse,
  registrationInputSchema,
  validationErrorFromZod,
} from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiValidationError("Envie os dados no formato JSON.");
    }
    const parsed = registrationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw validationErrorFromZod(parsed.error);
    }
    const registration = await createPublicApiClient().createRegistration(parsed.data);
    return Response.json(
      { data: registration },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(error);
  }
}
