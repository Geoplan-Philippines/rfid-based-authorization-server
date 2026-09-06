import { HttpException, HttpStatus } from '@nestjs/common';

export type FaceApiErrorCode =
  | 'DRIVER_NOT_FOUND'
  | 'DRIVER_ARCHIVED'
  | 'CONSENT_REQUIRED'
  | 'PROFILE_NOT_STARTED'
  | 'PROFILE_ALREADY_ACTIVE'
  | 'PROFILE_DISABLED'
  | 'PROFILE_ACTIVE_CANNOT_MODIFY'
  | 'INCOMPLETE_ENROLLMENT'
  | 'INCOHERENT_ANGLES'
  | 'CAPTURE_NOT_FOUND'
  | 'INVALID_ANGLE'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'FACE_SERVICE_UNAVAILABLE'
  | 'FACE_RECOGNITION_DISABLED'
  | 'ATTEMPT_NOT_FOUND';

export class FaceApiException extends HttpException {
  constructor(
    status: HttpStatus,
    error: FaceApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ message, error, ...details }, status);
  }
}
