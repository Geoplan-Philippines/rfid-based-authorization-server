import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { RFIDTagStatus } from '@prisma/client';

export class CreateRfidTagDTO {
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  epcId!: string;

  @IsUUID()
  assignedTruckId!: string;

  // Optional: lets you create BLOCKED/INACTIVE tags to test the DENIED path.
  // Omit to use the schema default (ACTIVE).
  @IsOptional()
  @IsEnum(RFIDTagStatus)
  status?: RFIDTagStatus;
}
