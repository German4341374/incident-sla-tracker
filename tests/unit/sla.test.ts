import { describe, expect, it } from 'vitest';

import { calculateSlaDeadline, isIncidentOverdue, SLA_HOURS } from '../../src/domain/sla.js';

describe('SLA calculation', () => {
  const createdAt = new Date('2026-01-15T10:00:00.000Z');

  it.each([
    ['LOW', 72],
    ['MEDIUM', 24],
    ['HIGH', 8],
    ['CRITICAL', 2],
  ] as const)('sets %s incidents to a %i hour deadline', (priority, hours) => {
    expect(SLA_HOURS[priority]).toBe(hours);
    expect(calculateSlaDeadline(priority, createdAt).toISOString()).toBe(
      new Date(createdAt.getTime() + hours * 3_600_000).toISOString(),
    );
  });

  it('marks an active incident overdue after its deadline', () => {
    expect(
      isIncidentOverdue({
        status: 'IN_PROGRESS',
        slaDeadline: new Date('2026-01-15T11:59:59.000Z'),
        now: new Date('2026-01-15T12:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('does not mark resolved or closed incidents overdue', () => {
    const slaDeadline = new Date('2026-01-15T11:00:00.000Z');
    const now = new Date('2026-01-15T12:00:00.000Z');
    expect(isIncidentOverdue({ status: 'RESOLVED', slaDeadline, now })).toBe(false);
    expect(isIncidentOverdue({ status: 'CLOSED', slaDeadline, now })).toBe(false);
  });

  it('treats the exact deadline as still within SLA', () => {
    const deadline = new Date('2026-01-15T12:00:00.000Z');
    expect(isIncidentOverdue({ status: 'OPEN', slaDeadline: deadline, now: deadline })).toBe(false);
  });
});
