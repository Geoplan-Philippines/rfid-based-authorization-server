import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class StartFaceEnrollmentDTO {
  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  consentReference?: string;

  @IsOptional()
  @IsBoolean()
  reset: boolean = false;
}
