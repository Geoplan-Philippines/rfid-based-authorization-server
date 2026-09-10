import 'dotenv/config';

import { PrismaClient, GateEventResult, RFIDTagStatus, SnapshotType, TimelineEventType, Role, TruckDriverAssignmentStatus, AssignmentRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

const dryRun = process.argv.includes('--dry-run');

class DryRunRollback extends Error {}

const maria = {
  id: 'f1ec337d-8771-44c4-aa18-8afbf37e7976',
  firstName: 'Maria',
  lastName: 'Santos',
  email: 'admin@eaglecement.com',
  password: '$2b$10$9tX2ahrceniltfviMGjQn.nI8x6PAqr3HpFhRDtDRvltz8PzUradG',
  role: Role.SUPER_ADMIN,
  createdAt: new Date('2026-06-07T21:20:36.689Z'),
  updatedAt: new Date('2026-06-07T21:20:36.689Z'),
};

const truck = {
  id: '1857488c-dd76-4bba-bf78-1aa2273448a5',
  plateNumber: 'UJF-472',
  model: 'Isuzu Giga CYZ52M Cement Bulker',
  createdAt: new Date('2026-06-07T22:02:48.917Z'),
  updatedAt: new Date('2026-06-13T00:29:21.028Z'),
};

const driver = {
  id: '094cde91-1732-435d-9735-8845f9b9c6ad',
  driverId: 'DRV-00001',
  firstName: 'Ramon',
  lastName: 'Reyes',
  licenseNumber: 'N04-18-764219',
  createdAt: new Date('2026-06-07T22:04:11.382Z'),
  updatedAt: new Date('2026-06-13T00:29:21.028Z'),
};

const rfidTag = {
  id: 'bb2a0ff6-10bd-4695-9782-4a6cfa841032',
  epcId: 'E2003412016C012345678901',
  createdAt: new Date('2026-06-07T22:06:19.531Z'),
  updatedAt: new Date('2026-06-13T00:29:21.028Z'),
};

const gateEvent = {
  id: '40b844e7-8fd2-453b-94a9-f7456d885d0f',
  eventCode: 'GATE-20260613-0004',
  occurredAt: new Date('2026-06-13T00:29:15.205Z'),
  createdAt: new Date('2026-06-13T00:29:15.293Z'),
  updatedAt: new Date('2026-06-13T00:29:21.028Z'),
};

const demoImages = {
  driver: '/uploads/drivers/8e0fc6b5-1431-49da-aa83-8242b33dae86.jpg',
  truck: '/uploads/trucks/cf48bf8c-ec6c-43de-b4a8-907035c99ecb.jpg',
};

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const existingEvent = await tx.gateEvent.findUnique({
        where: { eventCode: gateEvent.eventCode },
        select: { id: true },
      });

      if (existingEvent) {
        await tx.gateTimelineEvent.deleteMany({ where: { gateEventId: existingEvent.id } });
        await tx.gateSnapshot.deleteMany({ where: { gateEventId: existingEvent.id } });
        await tx.eventVerification.deleteMany({ where: { gateEventId: existingEvent.id } });
        await tx.gateEvent.delete({ where: { id: existingEvent.id } });
      }

      await tx.user.upsert({
        where: { email: maria.email },
        create: {
          ...maria,
          isArchived: false,
        },
        update: {
          id: maria.id,
          firstName: maria.firstName,
          lastName: maria.lastName,
          password: maria.password,
          role: maria.role,
          isArchived: false,
          updatedAt: maria.updatedAt,
        },
      });

      await tx.driver.upsert({
        where: { id: driver.id },
        create: {
          ...driver,
          photoUrl: demoImages.driver,
          isArchived: false,
        },
        update: {
          firstName: driver.firstName,
          lastName: driver.lastName,
          licenseNumber: driver.licenseNumber,
          photoUrl: demoImages.driver,
          isArchived: false,
          updatedAt: driver.updatedAt,
        },
      });

      await tx.truck.upsert({
        where: { id: truck.id },
        create: {
          ...truck,
          photoUrl: demoImages.truck,
          isArchived: false,
        },
        update: {
          plateNumber: truck.plateNumber,
          model: truck.model,
          photoUrl: demoImages.truck,
          isArchived: false,
          updatedAt: truck.updatedAt,
        },
      });

      await tx.truckDriverAssignment.upsert({
        where: {
          truckId_driverId: {
            truckId: truck.id,
            driverId: driver.id,
          },
        },
        create: {
          truckId: truck.id,
          driverId: driver.id,
          status: TruckDriverAssignmentStatus.ACTIVE,
          role: AssignmentRole.PRIMARY,
          createdAt: new Date('2026-06-07T22:05:36.114Z'),
          updatedAt: new Date('2026-06-13T00:29:21.028Z'),
        },
        update: {
          status: TruckDriverAssignmentStatus.ACTIVE,
          role: AssignmentRole.PRIMARY,
          updatedAt: new Date('2026-06-13T00:29:21.028Z'),
        },
      });

      await tx.rFIDTag.upsert({
        where: { id: rfidTag.id },
        create: {
          ...rfidTag,
          status: RFIDTagStatus.ACTIVE,
          assignedTruckId: truck.id,
        },
        update: {
          epcId: rfidTag.epcId,
          status: RFIDTagStatus.ACTIVE,
          assignedTruckId: truck.id,
          updatedAt: rfidTag.updatedAt,
        },
      });

      await tx.gateEvent.create({
        data: {
          ...gateEvent,
          plateNumberRead: 'NAX-518',
          result: GateEventResult.PLATE_MISMATCH,
          rfidTagId: rfidTag.id,
          truckId: truck.id,
          driverId: driver.id,
          verification: {
            create: {
              id: '55aff15c-24cd-4c85-8ed5-2972a399a273',
              rfidMatched: true,
              faceMatched: true,
              plateMatched: false,
              faceConfidence: 0.914,
              plateConfidence: 0.872,
              verifiedAt: new Date('2026-06-13T00:29:21.028Z'),
              createdAt: new Date('2026-06-13T00:29:15.293Z'),
              updatedAt: new Date('2026-06-13T00:29:21.028Z'),
            },
          },
          snapshots: {
            create: [
              {
                id: 'a514c80d-c6e2-46e8-9d31-d87974312285',
                type: SnapshotType.PLATE,
                imageUrl: demoImages.truck,
                createdAt: new Date('2026-06-13T00:29:17.642Z'),
                updatedAt: new Date('2026-06-13T00:29:17.642Z'),
              },
              {
                id: 'b5d39aa5-ffb9-4761-b0ab-4413c3715430',
                type: SnapshotType.WIDE,
                imageUrl: demoImages.truck,
                createdAt: new Date('2026-06-13T00:29:17.642Z'),
                updatedAt: new Date('2026-06-13T00:29:17.642Z'),
              },
              {
                id: '7b3ee34a-4191-4e25-adb0-87358cd4ba72',
                type: SnapshotType.FACE,
                imageUrl: demoImages.driver,
                createdAt: new Date('2026-06-13T00:29:19.184Z'),
                updatedAt: new Date('2026-06-13T00:29:19.184Z'),
              },
            ],
          },
          timeline: {
            create: [
              {
                id: '3911840e-eacc-4e20-8f31-7cc6941e8360',
                type: TimelineEventType.RFID_SCANNED,
                message: `EPC ${rfidTag.epcId}`,
                occurredAt: new Date('2026-06-13T00:29:15.205Z'),
                createdAt: new Date('2026-06-13T00:29:15.205Z'),
                updatedAt: new Date('2026-06-13T00:29:15.205Z'),
              },
              {
                id: '3fdd9030-937d-41f4-b922-73f5e65d96c0',
                type: TimelineEventType.TAG_VALIDATED,
                message: `bound to ${truck.plateNumber}`,
                metadata: { matchedTruckPlate: truck.plateNumber, rfidStatus: RFIDTagStatus.ACTIVE },
                occurredAt: new Date('2026-06-13T00:29:15.348Z'),
                createdAt: new Date('2026-06-13T00:29:15.348Z'),
                updatedAt: new Date('2026-06-13T00:29:15.348Z'),
              },
              {
                id: 'dad711a4-47a3-4aff-884c-8f890c859c09',
                type: TimelineEventType.PLATE_CAPTURED,
                message: 'NAX-518',
                metadata: {
                  expectedPlate: truck.plateNumber,
                  readPlate: 'NAX-518',
                  reason: 'adjacent lane plate captured in wide frame',
                },
                occurredAt: new Date('2026-06-13T00:29:17.642Z'),
                createdAt: new Date('2026-06-13T00:29:17.642Z'),
                updatedAt: new Date('2026-06-13T00:29:17.642Z'),
              },
              {
                id: 'b355dac1-9b72-419b-8bb8-b7bc340b86fe',
                type: TimelineEventType.FACE_CAPTURED,
                message: 'snapshot stored',
                occurredAt: new Date('2026-06-13T00:29:19.184Z'),
                createdAt: new Date('2026-06-13T00:29:19.184Z'),
                updatedAt: new Date('2026-06-13T00:29:19.184Z'),
              },
              {
                id: '9225ed1b-aa96-432b-96be-4cd8e6760915',
                type: TimelineEventType.FACE_MATCHED,
                message: 'matches assigned driver',
                metadata: { assignedDriver: 'Ramon Reyes', confidence: 0.914 },
                occurredAt: new Date('2026-06-13T00:29:19.533Z'),
                createdAt: new Date('2026-06-13T00:29:19.533Z'),
                updatedAt: new Date('2026-06-13T00:29:19.533Z'),
              },
              {
                id: 'ec6deb68-2d60-437b-9128-3579dbc4e11f',
                type: TimelineEventType.BARRIER_OPENED,
                message: 'RFID tag matched; opened by RFID policy',
                metadata: { openedBy: 'RFID_POLICY', operatorId: null },
                occurredAt: new Date('2026-06-13T00:29:21.028Z'),
                createdAt: new Date('2026-06-13T00:29:21.028Z'),
                updatedAt: new Date('2026-06-13T00:29:21.028Z'),
              },
            ],
          },
        },
      });

      if (dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log('Dry run succeeded; rolled back demo seed changes.');
      return;
    }

    throw error;
  }

  console.log('Seeded Maria Santos and GATE-20260613-0004 demo event.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
