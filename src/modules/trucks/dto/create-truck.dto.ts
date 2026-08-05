import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTruckDTO {
  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

  // Optional: trucks imported from the legacy registry have no recorded model.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;
}
