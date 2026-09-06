export const FACE_SERVICE_ERROR_CODES = [
  'INVALID_IMAGE',
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'CAMERA_NOT_CONFIGURED',
  'CAPTURE_NOT_FOUND',
  'IMAGE_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NO_FACE_DETECTED',
  'MULTIPLE_FACES',
  'TOO_MANY_SESSIONS',
  'MODEL_NOT_READY',
  'CAMERA_UNAVAILABLE',
  'FACE_SERVICE_TIMEOUT',
  'FACE_SERVICE_UNAVAILABLE',
  'FACE_SERVICE_INVALID_RESPONSE',
  'FACE_SERVICE_ERROR',
] as const;

export type FaceServiceErrorCode = (typeof FACE_SERVICE_ERROR_CODES)[number];

interface FaceServiceErrorOptions {
  code: FaceServiceErrorCode;
  message: string;
  statusCode?: number;
  requestId?: string;
  details?: unknown;
  upstreamCode?: string;
  cause?: unknown;
}

export class FaceServiceError extends Error {
  readonly code: FaceServiceErrorCode;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly upstreamCode?: string;

  constructor(options: FaceServiceErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = FaceServiceError.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.details = options.details;
    this.upstreamCode = options.upstreamCode;
  }

  get retryable(): boolean {
    return [
      'TOO_MANY_SESSIONS',
      'MODEL_NOT_READY',
      'CAMERA_UNAVAILABLE',
      'FACE_SERVICE_TIMEOUT',
      'FACE_SERVICE_UNAVAILABLE',
    ].includes(this.code);
  }
}

export function isFaceServiceErrorCode(value: string): value is FaceServiceErrorCode {
  return (FACE_SERVICE_ERROR_CODES as readonly string[]).includes(value);
}
