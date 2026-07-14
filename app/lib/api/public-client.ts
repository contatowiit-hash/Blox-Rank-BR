import { resolveApiBaseUrl } from "./config";
import { ApiInvalidResponseError, validationErrorFromZod } from "./errors";
import { requestApiJson } from "./request";
import {
  bracketEnvelopeSchema,
  healthSchema,
  registrationEnvelopeSchema,
  registrationInputSchema,
  registrationReceiptSchema,
  tournamentEnvelopeSchema,
} from "./schemas";
import type {
  ApiFetch,
  Health,
  PublicBracket,
  RegistrationInput,
  RegistrationReceipt,
  Tournament,
} from "./types";

interface PublicApiClientOptions {
  baseUrl?: string;
  fetcher?: ApiFetch;
  timeoutMs?: number;
}

export class PublicApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: ApiFetch | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: PublicApiClientOptions = {}) {
    this.baseUrl = resolveApiBaseUrl(options.baseUrl);
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async createRegistration(input: RegistrationInput): Promise<RegistrationReceipt> {
    const parsedInput = registrationInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw validationErrorFromZod(parsedInput.error);
    }
    const response = await requestApiJson({
      baseUrl: this.baseUrl,
      path: "/api/inscricoes",
      method: "POST",
      body: parsedInput.data,
      schema: registrationEnvelopeSchema,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    });
    const receipt = registrationReceiptSchema.safeParse({
      id: response.data.data.id,
      tournament_id: response.data.data.tournament_id,
      roblox_username: response.data.data.roblox_username,
      status: response.data.data.status,
      created_at: response.data.data.created_at,
    });
    if (!receipt.success) {
      throw new ApiInvalidResponseError();
    }
    return receipt.data;
  }

  async getCurrentTournament(): Promise<Tournament> {
    const response = await requestApiJson({
      baseUrl: this.baseUrl,
      path: "/api/torneios/atual",
      schema: tournamentEnvelopeSchema,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    });
    return response.data.data;
  }

  async getCurrentBracket(): Promise<PublicBracket> {
    const response = await requestApiJson({
      baseUrl: this.baseUrl,
      path: "/api/torneios/atual/chaveamento",
      schema: bracketEnvelopeSchema,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    });
    return response.data.data;
  }

  async getHealth(): Promise<{ health: Health; status: 200 | 503 }> {
    const response = await requestApiJson({
      baseUrl: this.baseUrl,
      path: "/health",
      schema: healthSchema,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      acceptedStatuses: [503],
    });
    return { health: response.data, status: response.status === 200 ? 200 : 503 };
  }
}

export function createPublicApiClient(): PublicApiClient {
  return new PublicApiClient();
}
