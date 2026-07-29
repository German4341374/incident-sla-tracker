import 'dotenv/config';

import { createDatabase, type IncidentPriority, type IncidentStatus } from '../src/db.js';
import { calculateSlaDeadline } from '../src/domain/sla.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demonstration seed is disabled in production');
}

const db = createDatabase();
const now = Date.now();

interface SeedIncident {
  title: string;
  description: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assignee: string | null;
  ageHours: number;
  resolutionHours?: number;
}

const incidents: SeedIncident[] = [
  {
    title: 'Checkout API returns intermittent 502 errors',
    description: 'Customers receive gateway errors while completing card payments.',
    priority: 'CRITICAL',
    status: 'IN_PROGRESS',
    assignee: 'Maya Chen',
    ageHours: 4,
  },
  {
    title: 'Production database connection pool exhausted',
    description: 'API latency increased after all available database connections were consumed.',
    priority: 'CRITICAL',
    status: 'RESOLVED',
    assignee: 'Alex Rivera',
    ageHours: 26,
    resolutionHours: 1.4,
  },
  {
    title: 'SSO login loops for enterprise tenant',
    description: 'SAML callback redirects the affected tenant back to the login page.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignee: 'Noah Williams',
    ageHours: 11,
  },
  {
    title: 'Notification worker queue is delayed',
    description: 'Email notifications are delivered approximately twenty minutes late.',
    priority: 'HIGH',
    status: 'OPEN',
    assignee: 'Maya Chen',
    ageHours: 3,
  },
  {
    title: 'Analytics export produces incomplete CSV',
    description: 'Rows after the first ten thousand records are missing from generated exports.',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignee: 'Priya Singh',
    ageHours: 28,
  },
  {
    title: 'Admin dashboard chart fails to load',
    description: 'The monthly usage chart remains in a loading state for some accounts.',
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    assignee: 'Liam Walker',
    ageHours: 9,
  },
  {
    title: 'Password reset email has broken link',
    description: 'The reset URL is missing its application host in staging-generated messages.',
    priority: 'HIGH',
    status: 'CLOSED',
    assignee: 'Noah Williams',
    ageHours: 72,
    resolutionHours: 3.2,
  },
  {
    title: 'Search results use stale customer names',
    description: 'Recently renamed customer accounts retain the previous name in search results.',
    priority: 'LOW',
    status: 'OPEN',
    assignee: 'Liam Walker',
    ageHours: 18,
  },
  {
    title: 'Mobile navigation overlaps support widget',
    description: 'The navigation drawer covers the support widget on narrow screens.',
    priority: 'LOW',
    status: 'CLOSED',
    assignee: 'Priya Singh',
    ageHours: 120,
    resolutionHours: 31,
  },
  {
    title: 'Webhook signatures rejected after key rotation',
    description: 'Incoming webhooks signed with the latest key are rejected as invalid.',
    priority: 'CRITICAL',
    status: 'CLOSED',
    assignee: 'Alex Rivera',
    ageHours: 48,
    resolutionHours: 1.7,
  },
  {
    title: 'Invoice PDF displays incorrect tax label',
    description: 'European invoices show VAT under the generic sales tax heading.',
    priority: 'MEDIUM',
    status: 'RESOLVED',
    assignee: 'Priya Singh',
    ageHours: 44,
    resolutionHours: 14,
  },
  {
    title: 'File upload progress freezes at 99 percent',
    description:
      'Large uploads complete successfully but the browser progress indicator never finishes.',
    priority: 'LOW',
    status: 'IN_PROGRESS',
    assignee: null,
    ageHours: 52,
  },
  {
    title: 'Audit log timestamps use server timezone',
    description: 'Displayed audit timestamps are not converted to the organization timezone.',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignee: 'Liam Walker',
    ageHours: 6,
  },
  {
    title: 'Rate limit headers are missing',
    description: 'Public API responses do not include remaining quota information.',
    priority: 'LOW',
    status: 'RESOLVED',
    assignee: 'Maya Chen',
    ageHours: 80,
    resolutionHours: 20,
  },
  {
    title: 'Background report job retries indefinitely',
    description:
      'A malformed report request remains in the retry queue without a terminal failure.',
    priority: 'HIGH',
    status: 'OPEN',
    assignee: 'Alex Rivera',
    ageHours: 2,
  },
];

await db.$transaction(async (transaction) => {
  await transaction.incidentStatusHistory.deleteMany();
  await transaction.incident.deleteMany();

  for (const item of incidents) {
    const createdAt = new Date(now - item.ageHours * 3_600_000);
    const resolvedAt =
      item.resolutionHours === undefined
        ? null
        : new Date(createdAt.getTime() + item.resolutionHours * 3_600_000);
    const changedAt = resolvedAt ?? new Date(createdAt.getTime() + 30 * 60_000);
    await transaction.incident.create({
      data: {
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: item.status,
        assignee: item.assignee,
        createdAt,
        slaDeadline: calculateSlaDeadline(item.priority, createdAt),
        resolvedAt,
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'OPEN', changedAt: createdAt },
            ...(item.status === 'OPEN'
              ? []
              : [
                  {
                    fromStatus: 'OPEN' as const,
                    toStatus: item.status,
                    changedAt,
                  },
                ]),
          ],
        },
      },
    });
  }
});

await db.$disconnect();
console.log(`Seeded ${incidents.length} demonstration incidents`);
