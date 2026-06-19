import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RFIDTagStatus } from '@prisma/client';

export class UpdateRfidTagStatusDTO {
  @IsEnum(RFIDTagStatus)
  status!: RFIDTagStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
