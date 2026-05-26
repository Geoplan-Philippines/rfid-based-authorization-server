import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTruckDTO {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsString()
  assignedDriverId?: string;
}