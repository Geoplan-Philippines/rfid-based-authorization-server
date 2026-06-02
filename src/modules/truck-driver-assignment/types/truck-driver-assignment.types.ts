import { Prisma } from '@prisma/client';

const assignmentWithRelations = Prisma.validator<Prisma.TruckDriverAssignmentDefaultArgs>()({
  include: {
    truck: true,
    driver: true,
  },
});

export type TruckDriverAssignmentWithRelations = Prisma.TruckDriverAssignmentGetPayload<
  typeof assignmentWithRelations
>;
