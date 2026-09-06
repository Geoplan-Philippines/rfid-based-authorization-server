import { Prisma } from '@prisma/client';

export const FACE_PROFILE_INCLUDE = {
  faceEmbeddings: {
    where: { isArchived: false },
    select: {
      id: true,
      angle: true,
      imageUrl: true,
      qualityScore: true,
      livenessScore: true,
      yaw: true,
      pitch: true,
      createdAt: true,
    },
  },
} satisfies Prisma.FaceProfileInclude;

export const FACE_DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  isArchived: true,
} satisfies Prisma.DriverSelect;

export const FACE_USER_NAME_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;
