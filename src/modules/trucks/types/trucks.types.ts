import { Truck, Driver, RFIDTag, GateEvent, Prisma } from '@prisma/client';

export type TruckWithRelations = Truck & {
  rfidTag?: RFIDTag;
  gateEvents?: GateEvent[];
};

const truckWithDrivers = Prisma.validator<Prisma.TruckDefaultArgs>()({
  include: {
    driverAssignments: {
      include: { driver: true },
    },
  },
});

export type TruckWithDrivers = Prisma.TruckGetPayload<typeof truckWithDrivers>;
