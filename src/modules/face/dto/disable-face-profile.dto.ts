import { IsOptional, IsString, Length } from 'class-validator';

export class DisableFaceProfileDTO {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reason?: string;
}
