import { FaceAngle } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class PreviewFaceDTO {
  @IsOptional()
  @IsEnum(FaceAngle)
  angle?: FaceAngle;
}
