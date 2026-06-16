import { Prisma } from '@prisma/client';

const rfidTagWithTruck = Prisma.validator<Prisma.RFIDTagDefaultArgs>()({
  include: { assignedTruck: true },
});

export type RfidTagWithTruck = Prisma.RFIDTagGetPayload<typeof rfidTagWithTruck>;
