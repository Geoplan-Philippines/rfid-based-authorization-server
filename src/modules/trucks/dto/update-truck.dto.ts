import { PartialType } from '@nestjs/mapped-types';

import { CreateTruckDTO } from './create-truck.dto';

export class UpdateTruckDTO extends PartialType(CreateTruckDTO) {}
