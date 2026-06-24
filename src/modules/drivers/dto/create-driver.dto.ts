import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDriverDTO {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;
}
