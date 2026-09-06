import { FaceAngle } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CaptureFaceAngleDTO {
  @IsEnum(FaceAngle)
  angle: FaceAngle;
}
