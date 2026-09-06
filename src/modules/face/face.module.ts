import { Module } from '@nestjs/common';

import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PrismaModule } from 'src/core/database/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FaceEnrollmentController } from './face-enrollment.controller';
import { FaceEnrollmentService } from './face-enrollment.service';
import { FaceImageUploadInterceptor } from './face-image-upload.interceptor';
import { FaceMatchingService } from './face-matching.service';
import { FaceOperationsService } from './face-operations.service';
import { FacePreviewController } from './face-preview.controller';
import { FacePreviewService } from './face-preview.service';
import { FaceServiceClient } from './face-service.client';
import { FaceController } from './face.controller';
import { FaceEmbeddingRepository } from './repositories/face-embedding.repository';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [FaceController, FaceEnrollmentController, FacePreviewController],
  providers: [
    FaceEmbeddingRepository,
    FaceServiceClient,
    // JwtService injects with no extra imports — AuthModule registers JwtModule as global.
    FacePreviewService,
    FaceMatchingService,
    FaceEnrollmentService,
    FaceImageUploadInterceptor,
    FaceOperationsService,
    ImageUploadService,
  ],
  exports: [FaceEmbeddingRepository, FaceServiceClient, FaceMatchingService, ImageUploadService],
})
export class FaceModule {}
