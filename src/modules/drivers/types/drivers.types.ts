import { Driver } from '@prisma/client';

export type DriverWithRelations = Driver & {
  assignedTrucks?: unknown[];
  gateEvents?: unknown[];
};