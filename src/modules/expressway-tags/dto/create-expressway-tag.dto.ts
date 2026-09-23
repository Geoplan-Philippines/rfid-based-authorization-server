import { IsString, IsOptional, IsUUID, IsEnum, IsNotEmpty } from 'class-validator';
import { ExpresswayTagStatus } from '@prisma/client';

export class CreateExpresswayTagDto {
  @IsString()
  @IsNotEmpty()
  epcId: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsUUID()
  @IsOptional()
  truckId?: string;

  @IsEnum(ExpresswayTagStatus)
  @IsOptional()
  status?: ExpresswayTagStatus;
}
