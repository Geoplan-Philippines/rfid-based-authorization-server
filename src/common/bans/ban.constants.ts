export const BAN_TYPE = {
  permanent: 'PERMANENT',
  untilDate: 'UNTIL_DATE',
} as const;

export type BanType = (typeof BAN_TYPE)[keyof typeof BAN_TYPE];

export const BAN_ENTITY_TYPE = {
  truck: 'Truck',
  driver: 'Driver',
} as const;

export type BanEntityType = (typeof BAN_ENTITY_TYPE)[keyof typeof BAN_ENTITY_TYPE];
