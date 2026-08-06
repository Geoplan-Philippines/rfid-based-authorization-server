import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MIN_LENGTH, USER_NAME_MAX_LENGTH } from '../constants/users.constants';

export class CreateUserDTO {
  @IsOptional()
  @IsString()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
