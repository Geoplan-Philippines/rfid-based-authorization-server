import { Prisma } from '@prisma/client';

export const ASSIGNMENT_INCLUDE = {
  truck: true,
  driver: true,
} satisfies Prisma.TruckDriverAssignmentInclude;
