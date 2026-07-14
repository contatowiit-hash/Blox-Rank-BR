import type { ZodType } from "zod";
import { apiErrorEnvelopeSchema } from "./schemas";
import {
  ApiClientError,
  ApiInvalidResponseError,
  ApiOfflineError,
} from "./errors";
import type { ApiFetch } from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAXIMUM_RESPONSE_CHARACTERS = 1_000_000;

interface ApiJsonRequestOptions<T> {
  baseUrl: string;
  path: string;
  schema: ZodType<T>;
  fetcher?: ApiFetch;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  acceptedStatuses?: readonly number[];
}

export interface ApiJsonResult<T> {
  data: T;
  status: number;
}

function safeStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

async function responseJson(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiInvalidResponseError();
  }
  if (text.length === 0 || text.length > MAXIMUM_RESPONSE_CHARACTERS) {
    throw new ApiInvalidResponseError();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiInvalidResponseError();
  }
}

export async function requestApiJson<T>(
  options: ApiJsonRequestOptions<T>,
): Promise<ApiJsonResult<T>> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const acceptedStatuses = options.acceptedStatuses ?? [];

  let response: Response;
  let json: unknown;
  try {
    response = await fetcher(new URL(options.path, options.baseUrl), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      redirect: "manual",
      signal: controller.signal,
    });
    json = await responseJson(response);
  } catch (error) {
    if (error instanceof ApiInvalidResponseError) {
      throw error;
    }
    throw new ApiOfflineError();
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok || acceptedStatuses.includes(response.status)) {
    const result = options.schema.safeParse(json);
    if (!result.success) {
      throw new ApiInvalidResponseError();
    }
    return { data: result.data, status: response.status };
  }

  const upstreamError = apiErrorEnvelopeSchema.safeParse(json);
  if (!upstreamError.success) {
    throw new ApiClientError({
      kind: "upstream",
      status: safeStatus(response.status),
      code: "UPSTREAM_ERROR",
      message: "N\u00e3o foi poss\u00edvel concluir esta a\u00e7\u00e3o.",
    });
  }

  throw new ApiClientError({
    kind: "upstream",
    status: safeStatus(response.status),
    code: upstreamError.data.error.code,
    message: upstreamError.data.error.message,
    issues: upstreamError.data.error.issues,
    requestId: upstreamError.data.error.requestId,
  });
}
