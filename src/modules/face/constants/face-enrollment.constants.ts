import { FaceAngle } from '@prisma/client';

import { ACCEPTED_FACE_IMAGE_MIME_TYPES } from 'src/common/uploads/image-upload.constants';

export interface FaceAngleRequirement {
  angle: FaceAngle;
  order: number;
  label: string;
  instruction: string;
  yawRange: { min: number; max: number };
  pitchRange: { min: number; max: number };
}

export const FACE_ANGLE_REQUIREMENTS: Record<FaceAngle, FaceAngleRequirement> = {
  [FaceAngle.FRONT]: {
    angle: FaceAngle.FRONT,
    order: 1,
    label: 'Look straight ahead',
    instruction: 'Face the camera directly with a neutral expression.',
    yawRange: { min: -12, max: 12 },
    pitchRange: { min: -10, max: 10 },
  },
  [FaceAngle.DOWN]: {
    angle: FaceAngle.DOWN,
    order: 2,
    label: 'Look down',
    instruction: 'Keep your head still and look down at the floor.',
    yawRange: { min: -15, max: 15 },
    pitchRange: { min: -35, max: -15 },
  },
  [FaceAngle.LEFT]: {
    angle: FaceAngle.LEFT,
    order: 3,
    label: 'Turn to your left',
    instruction: 'Turn your head to your left, keep your eyes on the camera.',
    yawRange: { min: 25, max: 50 },
    pitchRange: { min: -12, max: 12 },
  },
  [FaceAngle.RIGHT]: {
    angle: FaceAngle.RIGHT,
    order: 4,
    label: 'Turn to your right',
    instruction: 'Turn your head to your right, keep your eyes on the camera.',
    yawRange: { min: -50, max: -25 },
    pitchRange: { min: -12, max: 12 },
  },
};

export const DEFAULT_FACE_ANGLE_ORDER = [FaceAngle.FRONT, FaceAngle.DOWN, FaceAngle.LEFT, FaceAngle.RIGHT];
export const FACE_ACCEPTED_MIME_TYPES = ACCEPTED_FACE_IMAGE_MIME_TYPES;
export const FACE_ENROLLMENT_RECOMMENDED_WIDTH = 1280;
export const FACE_ENROLLMENT_RECOMMENDED_HEIGHT = 720;
export const FACE_DUPLICATE_SEARCH_LIMIT = 1;

export const FACE_AUDIT_ACTION = {
  startEnrollment: 'START_FACE_ENROLLMENT',
  resetEnrollment: 'RESET_FACE_ENROLLMENT',
  captureAngle: 'CAPTURE_FACE_ANGLE',
  deleteCapture: 'DELETE_FACE_CAPTURE',
  activateProfile: 'ACTIVATE_FACE_PROFILE',
  disableProfile: 'DISABLE_FACE_PROFILE',
  reviewAttempt: 'REVIEW_FACE_ATTEMPT',
} as const;

export const FACE_PROFILE_ENTITY_TYPE = 'FaceProfile';
export const FACE_ATTEMPT_ENTITY_TYPE = 'FaceRecognitionAttempt';
