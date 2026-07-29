import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';
import { createDatabase, type PrismaClient } from '../../src/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);

describe.skipIf(!enabled)('incident API integration', () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let incidentId: string;

  beforeAll(async () => {
    const config: AppConfig = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: databaseUrl ?? 'postgresql://unused',
    };
    db = createDatabase(config.DATABASE_URL);
    await db.incidentStatusHistory.deleteMany();
    await db.incident.deleteMany();
    app = await buildApp({ config, db });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database readiness', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('creates an incident with an automatic SLA and initial history', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      payload: {
        title: 'Payment gateway latency',
        description: 'Checkout requests exceed the expected response time.',
        priority: 'CRITICAL',
        assignee: 'Maya Chen',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      id: string;
      createdAt: string;
      slaDeadline: string;
      statusHistory: unknown[];
    }>();
    incidentId = body.id;
    expect(new Date(body.slaDeadline).getTime() - new Date(body.createdAt).getTime()).toBe(
      2 * 3_600_000,
    );
    expect(body.statusHistory).toHaveLength(1);
  });

  it('validates invalid input using the shared error envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      payload: { title: 'x', description: 'bad', priority: 'URGENT' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    });
    expect(response.json<{ error: { requestId: string } }>().error.requestId).toBeTruthy();
  });

  it('filters and searches incidents', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/incidents?priority=CRITICAL&assignee=Maya%20Chen&search=gateway',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: { id: string }[]; pagination: { total: number } }>();
    expect(body.pagination.total).toBe(1);
    expect(body.items[0]?.id).toBe(incidentId);
  });

  it('records status changes and sets resolvedAt', async () => {
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/incidents/${incidentId}`,
      payload: { status: 'RESOLVED' },
    });
    expect(update.statusCode).toBe(200);
    const body = update.json<{
      status: string;
      resolvedAt: string;
      statusHistory: { fromStatus: string | null; toStatus: string }[];
    }>();
    expect(body.status).toBe('RESOLVED');
    expect(body.resolvedAt).toBeTruthy();
    expect(body.statusHistory).toHaveLength(2);
    expect(body.statusHistory[0]).toMatchObject({
      fromStatus: 'OPEN',
      toStatus: 'RESOLVED',
    });
  });

  it('returns dashboard metrics', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      open: 0,
      overdue: 0,
      closed: 0,
    });
    expect(response.json<{ averageResolutionHours: number }>().averageResolutionHours).toBeTypeOf(
      'number',
    );
  });

  it('deletes incidents and returns a stable not-found error', async () => {
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/incidents/${incidentId}`,
        })
      ).statusCode,
    ).toBe(204);
    const response = await app.inject({ method: 'GET', url: `/api/incidents/${incidentId}` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'INCIDENT_NOT_FOUND' } });
  });
});
