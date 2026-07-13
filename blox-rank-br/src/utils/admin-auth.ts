import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { isApiKeyValid } from "./api-key.js";
import { parseWithSchema, UnauthorizedError, ValidationError } from "./errors.js";
import { actorDiscordIdSchema } from "./schemas.js";

export function createAdminAuthHook(expectedApiSecret: string): preHandlerHookHandler {
  return async function requireAdminApiKey(request): Promise<void> {
    const provided = request.headers["x-api-key"];
    if (!isApiKeyValid(provided, expectedApiSecret)) {
      throw new UnauthorizedError();
    }
  };
}

export function getAdminActorDiscordId(request: FastifyRequest): string {
  const value = request.headers["x-discord-user-id"];
  if (Array.isArray(value) || value === undefined) {
    throw new ValidationError(
      "Informe o responsável pela ação no header X-Discord-User-Id.",
      [{ field: "x-discord-user-id", message: "é obrigatório para alterações administrativas" }],
    );
  }
  return parseWithSchema(actorDiscordIdSchema, value);
}
