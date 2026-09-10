import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateDriverDTO } from './create-driver.dto';

export class UpdateDriverDTO extends PartialType(
  OmitType(CreateDriverDTO, ['driverId'] as const),
) {}
