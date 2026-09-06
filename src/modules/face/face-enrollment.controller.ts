import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FaceAngle, Role } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CaptureFaceAngleDTO } from './dto/capture-face-angle.dto';
import { DisableFaceProfileDTO } from './dto/disable-face-profile.dto';
import { StartFaceEnrollmentDTO } from './dto/start-face-enrollment.dto';
import { FaceEnrollmentService } from './face-enrollment.service';
import { FaceImageUploadInterceptor } from './face-image-upload.interceptor';
import type { FaceCaptureResult, FaceProfileContract } from './types/face-enrollment.types';

@Controller('drivers/:driverId/face-profile')
@UseGuards(PassportJwtGuard, RolesGuard)
export class FaceEnrollmentController {
  constructor(private readonly faceEnrollmentService: FaceEnrollmentService) {}

  @Get()
  async getDriverFaceProfile(
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ): Promise<FaceProfileContract> {
    return this.faceEnrollmentService.getDriverFaceProfile(driverId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async startFaceEnrollment(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: StartFaceEnrollmentDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceProfileContract> {
    return this.faceEnrollmentService.startFaceEnrollment(driverId, body, user.id);
  }

  @Post('captures')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FaceImageUploadInterceptor)
  async captureFaceAngle(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: CaptureFaceAngleDTO,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceCaptureResult> {
    return this.faceEnrollmentService.captureFaceAngle(driverId, body, image, user.id);
  }

  @Delete('captures/:angle')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async deleteFaceCapture(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('angle', new ParseEnumPipe(FaceAngle)) angle: FaceAngle,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceProfileContract> {
    return this.faceEnrollmentService.deleteFaceCapture(driverId, angle, user.id);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async activateFaceProfile(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceProfileContract> {
    return this.faceEnrollmentService.activateFaceProfile(driverId, user.id);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async disableFaceProfile(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: DisableFaceProfileDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FaceProfileContract> {
    return this.faceEnrollmentService.disableFaceProfile(driverId, body, user.id);
  }
}
