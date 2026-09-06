import { Prisma, TruckDriverAssignmentStatus } from '@prisma/client';

export const FACE_ATTEMPT_INCLUDE = {
  matchedDriver: {
    select: { id: true, firstName: true, lastName: true },
  },
  gateEvent: {
    select: {
      id: true,
      eventCode: true,
      result: true,
      truck: {
        select: {
          driverAssignments: {
            where: { status: TruckDriverAssignmentStatus.ACTIVE },
            orderBy: { role: 'asc' },
            select: {
              driverId: true,
              driver: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.FaceRecognitionAttemptInclude;

export const TRANSACTION_FACE_ATTEMPT_INCLUDE = {
  matchedDriver: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.FaceRecognitionAttemptInclude;
