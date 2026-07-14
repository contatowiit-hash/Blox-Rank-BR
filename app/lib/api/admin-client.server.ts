import "server-only";

import { serverEnvironment } from "../runtime-env.server";
import { resolveApiBaseUrl } from "./config";
import { ApiConfigurationError, validationErrorFromZod } from "./errors";
import { requestApiJson } from "./request";
import { registrationListEnvelopeSchema, uuidSchema } from "./schemas";
import type { ApiFetch, BackendRegistration, Pagination } from "./types";

interface AdminApiClientOptions {
  baseUrl?: string;
  token?: string;
  fetcher?: ApiFetch;
  timeoutMs?: number;
}

function resolveAdminToken(value: string | undefined = serverEnvironment.API_ADMIN_TOKEN): string {
  if (
    value === undefined ||
    value.length < 32 ||
    /replace|change-me/i.test(value)
  ) {
    throw new ApiConfigurationError();
  }
  return value;
}

export class AdminApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: ApiFetch | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: AdminApiClientOptions = {}) {
    this.baseUrl = resolveApiBaseUrl(options.baseUrl);
    this.token = resolveAdminToken(options.token);
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async listApprovedRegistrations(
    tournamentId: string,
  ): Promise<{ data: BackendRegistration[]; pagination: Pagination }> {
    const parsedId = uuidSchema.safeParse(tournamentId);
    if (!parsedId.success) {
      throw validationErrorFromZod(parsedId.error);
    }
    const query = new URLSearchParams({
      page: "1",
      limit: "100",
      status: "approved",
      tournament_id: parsedId.data,
    });
    const response = await requestApiJson({
      baseUrl: this.baseUrl,
      path: `/api/inscricoes?${query.toString()}`,
      schema: registrationListEnvelopeSchema,
      headers: { "X-API-Key": this.token },
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    });
    return response.data;
  }
}

export function createAdminApiClient(): AdminApiClient {
  return new AdminApiClient();
}
