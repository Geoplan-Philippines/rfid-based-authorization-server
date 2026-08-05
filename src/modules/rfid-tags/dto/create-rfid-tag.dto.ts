import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { RFIDTagStatus } from '@prisma/client';

export class CreateRfidTagDTO {
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  epcId!: string;

  // The number physically printed on the tag. Optional: not every tag is labelled.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  serialNo?: string;

  // Omit to register the tag as unbound spare stock; bind it to a truck later via rebind.
  @IsOptional()
  @IsUUID()
  assignedTruckId?: string;

  // Optional: lets you create BLOCKED/INACTIVE tags to test the DENIED path.
  // Omit to use the schema default (ACTIVE).
  @IsOptional()
  @IsEnum(RFIDTagStatus)
  status?: RFIDTagStatus;
}
