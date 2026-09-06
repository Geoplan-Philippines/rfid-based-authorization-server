import { FaceAngle, Role } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { FaceEnrollmentController } from './face-enrollment.controller';
import { FaceEnrollmentService } from './face-enrollment.service';
import { FaceOperationsService } from './face-operations.service';
import { FaceController } from './face.controller';

describe('face controllers', () => {
  const faceEnrollmentService = {
    getEnrollmentRequirements: jest.fn(),
    getDriverFaceProfile: jest.fn(),
    startFaceEnrollment: jest.fn(),
    captureFaceAngle: jest.fn(),
    deleteFaceCapture: jest.fn(),
    activateFaceProfile: jest.fn(),
    disableFaceProfile: jest.fn(),
    previewFace: jest.fn(),
  };
  const faceOperationsService = {
    getFaceAttempts: jest.fn(),
    getFaceAttemptById: jest.fn(),
    reviewFaceAttempt: jest.fn(),
    getFaceHealth: jest.fn(),
  };
  const service = faceEnrollmentService as unknown as FaceEnrollmentService;
  const faceController = new FaceController(service, faceOperationsService as unknown as FaceOperationsService);
  const enrollmentController = new FaceEnrollmentController(service);
  const user: AuthenticatedUser = { id: 'actor-1', email: 'admin@example.com', role: Role.ADMIN };
  const image = { buffer: Buffer.from('image') } as Express.Multer.File;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('delegates actor-sensitive enrollment calls with the authenticated user id', async () => {
    const startBody = { reset: true };
    const captureBody = { angle: FaceAngle.FRONT };
    const disableBody = { reason: 'Driver resigned' };

    await enrollmentController.startFaceEnrollment('driver-1', startBody, user);
    await enrollmentController.captureFaceAngle('driver-1', captureBody, image, user);
    await enrollmentController.deleteFaceCapture('driver-1', FaceAngle.FRONT, user);
    await enrollmentController.activateFaceProfile('driver-1', user);
    await enrollmentController.disableFaceProfile('driver-1', disableBody, user);

    expect(faceEnrollmentService.startFaceEnrollment).toHaveBeenCalledWith('driver-1', startBody, 'actor-1');
    expect(faceEnrollmentService.captureFaceAngle).toHaveBeenCalledWith('driver-1', captureBody, image, 'actor-1');
    expect(faceEnrollmentService.deleteFaceCapture).toHaveBeenCalledWith('driver-1', FaceAngle.FRONT, 'actor-1');
    expect(faceEnrollmentService.activateFaceProfile).toHaveBeenCalledWith('driver-1', 'actor-1');
    expect(faceEnrollmentService.disableFaceProfile).toHaveBeenCalledWith('driver-1', disableBody, 'actor-1');
  });

  it('delegates requirements, profile reads, and preview without altering inputs', async () => {
    const previewBody = { angle: FaceAngle.LEFT };

    faceController.getEnrollmentRequirements();
    await enrollmentController.getDriverFaceProfile('driver-1');
    await faceController.previewFace(previewBody, image);

    expect(faceEnrollmentService.getEnrollmentRequirements).toHaveBeenCalledWith();
    expect(faceEnrollmentService.getDriverFaceProfile).toHaveBeenCalledWith('driver-1');
    expect(faceEnrollmentService.previewFace).toHaveBeenCalledWith(image, previewBody);
  });

  it('delegates attempt review with the authenticated actor', async () => {
    const body = { reviewedOutcome: 'CONFIRMED_CORRECT' as const };

    await faceController.reviewFaceAttempt('attempt-1', body, user);

    expect(faceOperationsService.reviewFaceAttempt).toHaveBeenCalledWith('attempt-1', body, 'actor-1');
  });
});
