import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleEnum } from '@prisma/client';

export class CreateUserDTO {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(RoleEnum)
  role!: RoleEnum;
}
