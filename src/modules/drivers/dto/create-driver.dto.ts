import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

import { DRIVER_ID_EXAMPLE, DRIVER_ID_PATTERN } from '../drivers.constants';

export class CreateDriverDTO {
  @ApiProperty({
    description: 'Permanent Geoplan driver identifier.',
    example: DRIVER_ID_EXAMPLE,
    pattern: DRIVER_ID_PATTERN.source,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(DRIVER_ID_PATTERN, {
    message: `driverId must use the format ${DRIVER_ID_EXAMPLE}`,
  })
  driverId!: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Dela Cruz' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ example: 'N01-23-456789' })
  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;
}
