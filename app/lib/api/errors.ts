import { ZodError } from "zod";
import type { ApiIssue } from "./types";

export type ApiErrorKind =
  | "configuration"
  | "validation"
  | "offline"
  | "upstream"
  | "invalid_response";

interface ApiClientErrorOptions {
  kind: ApiErrorKind;
  status: number;
  code: string;
  message: string;
  issues?: readonly ApiIssue[];
  requestId?: string;
}
export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly issues: readonly ApiIssue[];
  readonly requestId: string | undefined;

  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.issues = options.issues ?? [];
    this.requestId = options.requestId;
  }
}

export class ApiConfigurationError extends ApiClientError {
  constructor() {
    super({
      kind: "configuration",
      status: 503,
      code: "API_UNAVAILABLE",
      message: "O sistema est\u00e1 temporariamente indispon\u00edvel.",
    });
    this.name = "ApiConfigurationError";
  }
}

export class ApiValidationError extends ApiClientError {
  constructor(message: string, issues: readonly ApiIssue[] = []) {
    super({ kind: "validation", status: 400, code: "VALIDATION_ERROR", message, issues });
    this.name = "ApiValidationError";
  }
}

export class ApiOfflineError extends ApiClientError {
  constructor() {
    super({
      kind: "offline",
      status: 503,
      code: "API_UNAVAILABLE",
      message: "N\u00e3o foi poss\u00edvel falar com o sistema agora. Tente novamente em instantes.",
    });
    this.name = "ApiOfflineError";
  }
}

export class ApiInvalidResponseError extends ApiClientError {
  constructor() {
    super({
      kind: "invalid_response",
      status: 502,
      code: "INVALID_API_RESPONSE",
      message: "O sistema devolveu uma resposta inesperada.",
    });
    this.name = "ApiInvalidResponseError";
  }
}

export function zodIssues(error: ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length === 0 ? "request" : issue.path.join("."),
    message: issue.message,
  }));
}

export function validationErrorFromZod(error: ZodError): ApiValidationError {
  return new ApiValidationError("Confira os dados informados.", zodIssues(error));
}

interface PublicErrorResponseOptions {
  hideUpstreamAuthorization?: boolean;
}

export function publicErrorResponse(
  error: unknown,
  options: PublicErrorResponseOptions = {},
): Response {
  let safeError: ApiClientError;
  if (error instanceof ApiClientError) {
    safeError = error;
  } else if (error instanceof ZodError) {
    safeError = validationErrorFromZod(error);
  } else {
    safeError = new ApiClientError({
      kind: "invalid_response",
      status: 500,
      code: "INTERNAL_ERROR",
      message: "N\u00e3o foi poss\u00edvel concluir esta a\u00e7\u00e3o.",
    });
  }

  if (
    options.hideUpstreamAuthorization === true &&
    safeError.kind === "upstream" &&
    (safeError.status === 401 || safeError.status === 403)
  ) {
    safeError = new ApiOfflineError();
  }

  const body = {
    error: {
      code: safeError.code,
      message: safeError.message,
      ...(safeError.requestId === undefined ? {} : { requestId: safeError.requestId }),
      ...(safeError.issues.length === 0 ? {} : { issues: safeError.issues }),
    },
  };

  return Response.json(body, {
    status: safeError.status,
    headers: { "Cache-Control": "no-store" },
  });
}
