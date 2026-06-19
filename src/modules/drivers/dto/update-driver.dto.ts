import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateDriverDTO {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseNumber?: string;
}
