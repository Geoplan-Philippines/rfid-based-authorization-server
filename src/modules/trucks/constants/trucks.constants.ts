import { Prisma, TruckDriverAssignmentStatus } from '@prisma/client';

export const TRUCK_ENTITY_TYPE = 'Truck';

export const TRUCK_AUDIT_ACTION = {
  create: 'CREATE_TRUCK',
  update: 'UPDATE_TRUCK',
  archive: 'ARCHIVE_TRUCK',
  restore: 'RESTORE_TRUCK',
  ban: 'BAN_TRUCK',
  liftBan: 'LIFT_TRUCK_BAN',
  uploadPhoto: 'UPLOAD_TRUCK_PHOTO',
} as const;

export type TruckAuditAction = (typeof TRUCK_AUDIT_ACTION)[keyof typeof TRUCK_AUDIT_ACTION];

export const TRUCK_LIST_INCLUDE = {
  rfidTag: true,
  driverAssignments: {
    where: { status: TruckDriverAssignmentStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: { driver: true },
  },
} satisfies Prisma.TruckInclude;

export const TRUCK_DETAIL_INCLUDE = TRUCK_LIST_INCLUDE;

export const TRUCK_WITH_DRIVERS_INCLUDE = {
  driverAssignments: {
    include: { driver: true },
  },
} satisfies Prisma.TruckInclude;

export const UNTAGGED_TRUCK_SELECT = {
  id: true,
  plateNumber: true,
  model: true,
} satisfies Prisma.TruckSelect;
