import type { FastifyPluginAsync, preHandlerHookHandler } from "fastify";
import { getAdminActorDiscordId } from "../utils/admin-auth.js";
import { parseWithSchema } from "../utils/errors.js";
import { idParamsSchema, matchResultSchema, type MatchResultInput } from "../utils/schemas.js";

export interface MatchOperations {
  recordResult(id: string, input: MatchResultInput, actorDiscordId: string): Promise<unknown>;
}

interface MatchRoutesOptions {
  matches: MatchOperations;
  requireAdmin: preHandlerHookHandler;
}

export const matchRoutes: FastifyPluginAsync<MatchRoutesOptions> = async (app, options) => {
  app.post(
    "/api/partidas/:id/resultado",
    { preHandler: options.requireAdmin },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(matchResultSchema, request.body);
      const actorDiscordId = getAdminActorDiscordId(request);
      const result = await options.matches.recordResult(id, input, actorDiscordId);
      return reply.code(200).send({ data: result });
    },
  );
};
