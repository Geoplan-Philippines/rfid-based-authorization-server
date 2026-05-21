import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '@prisma/client';

export class CreateUserDTO {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
