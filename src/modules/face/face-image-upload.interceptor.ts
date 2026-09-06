import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import { FACE_IMAGE_UPLOAD_OPTIONS } from 'src/common/uploads/image-upload.constants';
import { FaceApiException } from './errors/face-api.exception';

const MulterFaceImageInterceptor = FileInterceptor('image', FACE_IMAGE_UPLOAD_OPTIONS);

@Injectable()
export class FaceImageUploadInterceptor extends MulterFaceImageInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new FaceApiException(
          error.getStatus(),
          'IMAGE_TOO_LARGE',
          'Uploaded image exceeds the configured size limit',
        );
      }
      throw error;
    }
  }
}
