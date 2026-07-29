import { join } from 'node:path';

import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import type { AppConfig } from './config.js';
import { createDatabase, type PrismaClient } from './db.js';
import { AppError } from './errors.js';
import { IncidentService } from './incident-service.js';
import {
  createIncidentSchema,
  idParamsSchema,
  listIncidentSchema,
  priorities,
  statuses,
  updateIncidentSchema,
} from './schemas.js';

const incidentBodyJsonSchema = {
  type: 'object',
  required: ['title', 'description', 'priority'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 160 },
    description: { type: 'string', minLength: 5, maxLength: 10_000 },
    priority: { type: 'string', enum: priorities },
    status: { type: 'string', enum: statuses, default: 'OPEN' },
    assignee: {
      anyOf: [{ type: 'string', minLength: 2, maxLength: 120 }, { type: 'null' }],
    },
  },
};

function getValidationDetails(
  error: unknown,
): { found: false } | { found: true; details: unknown } {
  if (typeof error !== 'object' || error === null || !('validation' in error)) {
    return { found: false };
  }
  return { found: true, details: (error as { validation?: unknown }).validation };
}

export async function buildApp(options: {
  config: AppConfig;
  db?: PrismaClient;
}): Promise<FastifyInstance> {
  const db = options.db ?? createDatabase(options.config.DATABASE_URL);
  const incidents = new IncidentService(db);
  const app = Fastify({
    logger: {
      level: options.config.LOG_LEVEL,
      redact: ['req.headers.authorization', '*.password', '*.token', '*.secret'],
    },
    genReqId: (request) => String(request.headers['x-request-id'] ?? crypto.randomUUID()),
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Incident SLA Tracker API',
        description: 'Support incident registration, SLA tracking and operational reporting.',
        version: '1.0.0',
      },
      tags: [
        { name: 'incidents', description: 'Incident lifecycle operations' },
        { name: 'operations', description: 'Health and dashboard endpoints' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', {
    schema: {
      tags: ['operations'],
      summary: 'Liveness and database readiness check',
    },
    handler: async () => {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ok', service: 'incident-sla-tracker' };
    },
  });

  app.get('/api/dashboard', {
    schema: { tags: ['operations'], summary: 'Incident dashboard metrics' },
    handler: () => incidents.dashboard(),
  });

  app.post('/api/incidents', {
    schema: {
      tags: ['incidents'],
      summary: 'Create an incident and calculate its SLA deadline',
      body: incidentBodyJsonSchema,
    },
    handler: async (request, reply) => {
      const input = createIncidentSchema.parse(request.body);
      const incident = await incidents.create(input);
      return reply.code(201).send(incident);
    },
  });

  app.get('/api/incidents', {
    schema: {
      tags: ['incidents'],
      summary: 'List, filter and search incidents',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: statuses },
          priority: { type: 'string', enum: priorities },
          assignee: { type: 'string' },
          search: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
    handler: (request) => incidents.list(listIncidentSchema.parse(request.query)),
  });

  app.get('/api/incidents/:id', {
    schema: {
      tags: ['incidents'],
      summary: 'Get an incident with status history',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return incidents.get(id);
    },
  });

  app.patch('/api/incidents/:id', {
    schema: {
      tags: ['incidents'],
      summary: 'Update an incident and record status changes',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: { ...incidentBodyJsonSchema, required: [], minProperties: 1 },
    },
    handler: (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return incidents.update(id, updateIncidentSchema.parse(request.body));
    },
  });

  app.delete('/api/incidents/:id', {
    schema: {
      tags: ['incidents'],
      summary: 'Delete an incident',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      await incidents.delete(id);
      return reply.code(204).send();
    },
  });

  const publicRoot =
    options.config.NODE_ENV === 'production'
      ? join(import.meta.dirname, 'public')
      : join(import.meta.dirname, '..', 'public');
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: '/',
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'The requested API route does not exist',
          requestId: request.id,
        },
      });
    }
    return reply.code(404).sendFile('index.html');
  });

  app.setErrorHandler((error, request, reply) => {
    const validationDetails = getValidationDetails(error);
    const normalized =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError('VALIDATION_ERROR', 'Request validation failed', 422, error.issues)
          : validationDetails.found
            ? new AppError(
                'VALIDATION_ERROR',
                'Request validation failed',
                422,
                validationDetails.details,
              )
            : new AppError(
                'INTERNAL_ERROR',
                options.config.NODE_ENV === 'production'
                  ? 'An unexpected error occurred'
                  : error instanceof Error
                    ? error.message
                    : 'Unexpected error',
                500,
              );
    if (normalized.statusCode >= 500) request.log.error({ err: error }, 'request failed');
    return reply.code(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
        requestId: request.id,
      },
    });
  });

  app.addHook('onClose', async () => db.$disconnect());
  return app;
}
