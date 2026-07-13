import type { FastifyPluginAsync, preHandlerHookHandler } from "fastify";
import { getAdminActorDiscordId } from "../utils/admin-auth.js";
import { parseWithSchema } from "../utils/errors.js";
import { idParamsSchema } from "../utils/schemas.js";

export interface TournamentOperations {
  getCurrent(): Promise<unknown>;
  getCurrentBracket(): Promise<unknown>;
  generateBracket(id: string, actorDiscordId: string): Promise<unknown>;
}

interface TournamentRoutesOptions {
  tournaments: TournamentOperations;
  requireAdmin: preHandlerHookHandler;
}

export const tournamentRoutes: FastifyPluginAsync<TournamentRoutesOptions> = async (app, options) => {
  app.get("/api/torneios/atual", async (_request, reply) => {
    const tournament = await options.tournaments.getCurrent();
    return reply.code(200).send({ data: tournament });
  });

  app.get("/api/torneios/atual/chaveamento", async (_request, reply) => {
    const bracket = await options.tournaments.getCurrentBracket();
    return reply.code(200).send({ data: bracket });
  });

  app.post(
    "/api/torneios/:id/gerar-chaveamento",
    { preHandler: options.requireAdmin },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const actorDiscordId = getAdminActorDiscordId(request);
      const bracket = await options.tournaments.generateBracket(id, actorDiscordId);
      return reply.code(201).send({ data: bracket });
    },
  );
};
