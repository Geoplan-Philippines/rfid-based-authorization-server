import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { ExpresswayTagStatus } from '@prisma/client';

export class UpdateExpresswayTagStatusDto {
  @IsEnum(ExpresswayTagStatus)
  @IsNotEmpty()
  status: ExpresswayTagStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
