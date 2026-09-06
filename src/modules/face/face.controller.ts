import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PreviewFaceDTO } from './dto/preview-face.dto';
import { GetFaceAttemptsQueryDTO } from './dto/get-face-attempts-query.dto';
import { ReviewFaceAttemptDTO } from './dto/review-face-attempt.dto';
import { FaceEnrollmentService } from './face-enrollment.service';
import { FaceImageUploadInterceptor } from './face-image-upload.interceptor';
import { FaceOperationsService } from './face-operations.service';
import type {
  FaceAttemptDetailContract,
  FaceAttemptListResponse,
  FaceHealthContract,
} from './types/face-attempt.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { FaceEnrollmentRequirements, FacePreviewResult } from './types/face-enrollment.types';

@Controller('face')
@UseGuards(PassportJwtGuard, RolesGuard)
export class FaceController {
  constructor(
    private readonly faceEnrollmentService: FaceEnrollmentService,
    private readonly faceOperationsService: FaceOperationsService,
  ) {}

  @Get('enrollment-requirements')
  getEnrollmentRequirements(): FaceEnrollmentRequirements {
    return this.faceEnrollmentService.getEnrollmentRequirements();
  }

  @Post('preview-check')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FaceImageUploadInterceptor)
  async previewFace(
    @Body() body: PreviewFaceDTO,
    @UploadedFile() image: Express.Multer.File | undefined,
  ): Promise<FacePreviewResult> {
    return this.faceEnrollmentService.previewFace(image, body);
  }

  @Get('attempts')
  async getFaceAttempts(@Query() query: GetFaceAttemptsQueryDTO): Promise<FaceAttemptListResponse> {
    return this.faceOperationsService.getFaceAttempts(query);
  }

  @Get('attempts/:id')
  async getFaceAttemptById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FaceAttemptDetailContract> {
    return this.faceOperationsService.getFaceAttemptById(id);
  }

  @Post('attempts/:id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async reviewFaceAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewFaceAttemptDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceAttemptDetailContract> {
    return this.faceOperationsService.reviewFaceAttempt(id, body, user.id);
  }

  @Get('health')
  async getFaceHealth(): Promise<FaceHealthContract> {
    return this.faceOperationsService.getFaceHealth();
  }
}
