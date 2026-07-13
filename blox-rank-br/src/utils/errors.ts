import type { ZodIssue, ZodType } from "zod";

export interface PublicValidationIssue {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly issues?: readonly PublicValidationIssue[];

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    issues?: readonly PublicValidationIssue[],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    if (issues !== undefined) {
      this.issues = issues;
    }
  }
}

export class ValidationError extends AppError {
  public constructor(message = "Confira os dados informados.", issues?: readonly PublicValidationIssue[]) {
    super(400, "VALIDATION_ERROR", message, issues);
  }
}

export class UnauthorizedError extends AppError {
  public constructor() {
    super(401, "UNAUTHORIZED", "Não foi possível autorizar esta ação.");
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = "Você não tem permissão para esta ação.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  public constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  public constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class ServiceUnavailableError extends AppError {
  public constructor(message = "Serviço temporariamente indisponível.") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}

function toPublicIssue(issue: ZodIssue): PublicValidationIssue {
  return {
    field: issue.path.length > 0 ? issue.path.join(".") : "request",
    message: issue.message,
  };
}

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError("Confira os dados informados.", result.error.issues.map(toPublicIssue));
  }
  return result.data;
}

export function isPostgresError(error: unknown, code?: string): error is Error & { code: string; constraint?: string } {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const actualCode = (error as { code?: unknown }).code;
  return typeof actualCode === "string" && (code === undefined || actualCode === code);
}
