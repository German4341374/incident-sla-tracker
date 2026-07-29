import { z } from 'zod';

export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export const createIncidentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(10_000),
  priority: z.enum(priorities),
  status: z.enum(statuses).default('OPEN'),
  assignee: z.string().trim().min(2).max(120).nullable().optional(),
});

export const updateIncidentSchema = createIncidentSchema
  .omit({ status: true })
  .partial()
  .extend({ status: z.enum(statuses).optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const listIncidentSchema = z.object({
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  assignee: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamsSchema = z.object({
  id: z.string().min(20).max(40),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ListIncidentInput = z.infer<typeof listIncidentSchema>;
