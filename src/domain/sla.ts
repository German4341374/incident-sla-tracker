export const SLA_HOURS = {
  LOW: 72,
  MEDIUM: 24,
  HIGH: 8,
  CRITICAL: 2,
} as const;

export type Priority = keyof typeof SLA_HOURS;

export function calculateSlaDeadline(priority: Priority, createdAt = new Date()): Date {
  return new Date(createdAt.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);
}

export function isIncidentOverdue(input: {
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  slaDeadline: Date;
  now?: Date;
}): boolean {
  if (input.status === 'RESOLVED' || input.status === 'CLOSED') return false;
  return input.slaDeadline.getTime() < (input.now ?? new Date()).getTime();
}
