import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import { sanitizeErrorName } from "./sanitize.js";

interface ErrorPayload {
  error: {
    code: string;
    message: string;
    requestId: string;
    issues?: readonly { field: string; message: string }[];
  };
}

const TRANSIENT_ERROR_CODES = new Set(["57014", "55P03", "57P01", "ECONNREFUSED", "ETIMEDOUT"]);

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  issues?: readonly { field: string; message: string }[],
): void {
  const payload: ErrorPayload = {
    error: {
      code,
      message,
      requestId: request.id,
      ...(issues === undefined ? {} : { issues }),
    },
  };
  void reply.code(statusCode).send(payload);
}

export function configureErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    sendError(reply, request, 404, "ROUTE_NOT_FOUND", "Rota não encontrada.");
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      sendError(reply, request, error.statusCode, error.code, error.message, error.issues);
      return;
    }

    if (error.statusCode === 429) {
      sendError(reply, request, 429, "RATE_LIMITED", "Muitas tentativas. Aguarde um pouco e tente novamente.");
      return;
    }

    if (error.statusCode === 413) {
      sendError(reply, request, 413, "PAYLOAD_TOO_LARGE", "Os dados enviados são maiores que o permitido.");
      return;
    }

    if (error.statusCode === 400) {
      sendError(reply, request, 400, "BAD_REQUEST", "Não foi possível entender os dados enviados.");
      return;
    }

    if (error.statusCode === 415) {
      sendError(reply, request, 415, "UNSUPPORTED_MEDIA_TYPE", "Envie os dados no formato JSON.");
      return;
    }

    if (typeof error.code === "string" && TRANSIENT_ERROR_CODES.has(error.code)) {
      request.log.warn(
        { event: "dependency_temporarily_unavailable", errorCode: error.code },
        "Uma dependência temporariamente indisponível impediu a requisição",
      );
      sendError(
        reply,
        request,
        503,
        "SERVICE_UNAVAILABLE",
        "Serviço temporariamente indisponível.",
      );
      return;
    }

    request.log.error(
      {
        event: "request_failed",
        requestId: request.id,
        errorName: sanitizeErrorName(error),
        errorCode: typeof error.code === "string" ? error.code.slice(0, 40) : undefined,
      },
      "Falha inesperada ao processar requisição",
    );
    sendError(reply, request, 500, "INTERNAL_ERROR", "Não foi possível concluir esta ação.");
  });
}
