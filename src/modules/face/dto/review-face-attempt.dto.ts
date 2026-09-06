import { FaceReviewOutcome } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ReviewFaceAttemptDTO {
  @IsEnum(FaceReviewOutcome)
  reviewedOutcome: FaceReviewOutcome;

  @IsOptional()
  @IsUUID()
  actualDriverId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}
