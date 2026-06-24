import { PartialType } from '@nestjs/mapped-types';

import { CreateDriverDTO } from './create-driver.dto';

export class UpdateDriverDTO extends PartialType(CreateDriverDTO) {}
