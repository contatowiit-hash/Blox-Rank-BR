import type { FastifyPluginAsync, preHandlerHookHandler } from "fastify";
import { getAdminActorDiscordId } from "../utils/admin-auth.js";
import { parseWithSchema } from "../utils/errors.js";
import {
  createRegistrationSchema,
  idParamsSchema,
  registrationListQuerySchema,
  updateRegistrationStatusSchema,
  type CreateRegistrationInput,
  type RegistrationListQuery,
  type UpdateRegistrationStatusInput,
} from "../utils/schemas.js";

export interface RegistrationOperations {
  create(input: CreateRegistrationInput): Promise<unknown>;
  list(query: RegistrationListQuery): Promise<{
    items: readonly unknown[];
    total: number;
    page: number;
    limit: number;
  }>;
  getById(id: string): Promise<unknown>;
  updateStatus(id: string, input: UpdateRegistrationStatusInput, actorDiscordId: string): Promise<unknown>;
}

interface RegistrationRoutesOptions {
  registrations: RegistrationOperations;
  requireAdmin: preHandlerHookHandler;
  registrationRateLimitMax: number;
}

export const registrationRoutes: FastifyPluginAsync<RegistrationRoutesOptions> = async (app, options) => {
  app.post(
    "/api/inscricoes",
    {
      config: {
        rateLimit: {
          max: options.registrationRateLimitMax,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const input = parseWithSchema(createRegistrationSchema, request.body);
      const registration = await options.registrations.create(input);
      return reply.code(201).send({ data: registration });
    },
  );

  app.get(
    "/api/inscricoes",
    { preHandler: options.requireAdmin },
    async (request, reply) => {
      const query = parseWithSchema(registrationListQuerySchema, request.query);
      const result = await options.registrations.list(query);
      return reply.code(200).send({
        data: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: Math.ceil(result.total / result.limit),
        },
      });
    },
  );

  app.get(
    "/api/inscricoes/:id",
    { preHandler: options.requireAdmin },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const registration = await options.registrations.getById(id);
      return reply.code(200).send({ data: registration });
    },
  );

  app.patch(
    "/api/inscricoes/:id/status",
    { preHandler: options.requireAdmin },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const input = parseWithSchema(updateRegistrationStatusSchema, request.body);
      const actorDiscordId = getAdminActorDiscordId(request);
      const registration = await options.registrations.updateStatus(id, input, actorDiscordId);
      return reply.code(200).send({ data: registration });
    },
  );
};
