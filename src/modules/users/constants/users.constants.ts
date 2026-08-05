export const USER_ENTITY_TYPE = 'User';

export const USER_AUDIT_ACTION = {
  create: 'CREATE_USER',
  update: 'UPDATE_USER',
  archive: 'ARCHIVE_USER',
  unarchive: 'UNARCHIVE_USER',
} as const;

export type UserAuditAction = (typeof USER_AUDIT_ACTION)[keyof typeof USER_AUDIT_ACTION];

export const PASSWORD_SALT_ROUNDS = 10;

export const PASSWORD_MIN_LENGTH = 8;

export const USER_NAME_MAX_LENGTH = 100;
