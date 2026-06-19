import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTruckDTO {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;
}
