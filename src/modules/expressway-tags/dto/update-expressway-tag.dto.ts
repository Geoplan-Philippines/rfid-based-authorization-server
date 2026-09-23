import { IsString, IsOptional, IsUUID } from 'class-validator';

export class UpdateExpresswayTagDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsUUID()
  @IsOptional()
  truckId?: string;
}
