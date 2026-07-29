import type { Prisma, PrismaClient } from './db.js';
import { calculateSlaDeadline, isIncidentOverdue } from './domain/sla.js';
import { AppError } from './errors.js';
import type { CreateIncidentInput, ListIncidentInput, UpdateIncidentInput } from './schemas.js';

const incidentInclude = {
  statusHistory: {
    orderBy: { changedAt: 'desc' as const },
  },
};

type IncidentWithHistory = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

function presentIncident(
  incident: IncidentWithHistory,
): IncidentWithHistory & { isOverdue: boolean } {
  return {
    ...incident,
    isOverdue: isIncidentOverdue(incident),
  };
}

export class IncidentService {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateIncidentInput) {
    const createdAt = new Date();
    const incident = await this.db.incident.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        assignee: input.assignee ?? null,
        createdAt,
        slaDeadline: calculateSlaDeadline(input.priority, createdAt),
        resolvedAt: input.status === 'RESOLVED' || input.status === 'CLOSED' ? createdAt : null,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: input.status,
            changedAt: createdAt,
          },
        },
      },
      include: incidentInclude,
    });
    return presentIncident(incident);
  }

  async list(input: ListIncidentInput) {
    const where: Prisma.IncidentWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assignee ? { assignee: { equals: input.assignee, mode: 'insensitive' } } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: 'insensitive' } },
              { description: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.incident.findMany({
        where,
        include: incidentInclude,
        orderBy: [{ slaDeadline: 'asc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.db.incident.count({ where }),
    ]);
    return {
      items: items.map(presentIncident),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        pages: Math.ceil(total / input.limit),
      },
    };
  }

  async get(id: string) {
    const incident = await this.db.incident.findUnique({
      where: { id },
      include: incidentInclude,
    });
    if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'Incident was not found', 404);
    return presentIncident(incident);
  }

  async update(id: string, input: UpdateIncidentInput) {
    const result = await this.db.$transaction(async (transaction) => {
      const existing = await transaction.incident.findUnique({ where: { id } });
      if (!existing) throw new AppError('INCIDENT_NOT_FOUND', 'Incident was not found', 404);

      const statusChanged = input.status !== undefined && input.status !== existing.status;
      const priorityChanged = input.priority !== undefined && input.priority !== existing.priority;
      const effectiveStatus = input.status ?? existing.status;
      const now = new Date();

      await transaction.incident.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.assignee === undefined ? {} : { assignee: input.assignee }),
          ...(priorityChanged
            ? {
                slaDeadline: calculateSlaDeadline(
                  input.priority ?? existing.priority,
                  existing.createdAt,
                ),
              }
            : {}),
          ...(statusChanged
            ? {
                resolvedAt:
                  effectiveStatus === 'RESOLVED' || effectiveStatus === 'CLOSED'
                    ? (existing.resolvedAt ?? now)
                    : null,
              }
            : {}),
        },
      });

      if (statusChanged) {
        await transaction.incidentStatusHistory.create({
          data: {
            incidentId: id,
            fromStatus: existing.status,
            toStatus: effectiveStatus,
            changedAt: now,
          },
        });
      }
      return transaction.incident.findUniqueOrThrow({
        where: { id },
        include: incidentInclude,
      });
    });
    return presentIncident(result);
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.incident.deleteMany({ where: { id } });
    if (result.count === 0) throw new AppError('INCIDENT_NOT_FOUND', 'Incident was not found', 404);
  }

  async dashboard() {
    const now = new Date();
    const activeStatuses = ['OPEN', 'IN_PROGRESS'] as const;
    const [total, open, overdue, closed, resolvedIncidents] = await this.db.$transaction([
      this.db.incident.count(),
      this.db.incident.count({ where: { status: { in: [...activeStatuses] } } }),
      this.db.incident.count({
        where: { status: { in: [...activeStatuses] }, slaDeadline: { lt: now } },
      }),
      this.db.incident.count({ where: { status: 'CLOSED' } }),
      this.db.incident.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);
    const durations = resolvedIncidents
      .filter(
        (incident): incident is { createdAt: Date; resolvedAt: Date } =>
          incident.resolvedAt !== null,
      )
      .map((incident) => incident.resolvedAt.getTime() - incident.createdAt.getTime());
    const averageResolutionHours =
      durations.length === 0
        ? null
        : Math.round(
            (durations.reduce((sum, duration) => sum + duration, 0) /
              durations.length /
              3_600_000) *
              10,
          ) / 10;
    return { total, open, overdue, closed, averageResolutionHours };
  }
}
