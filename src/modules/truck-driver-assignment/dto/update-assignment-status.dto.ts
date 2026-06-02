import { IsEnum } from 'class-validator';

import { TruckDriverAssignmentStatus } from '@prisma/client';

export class UpdateAssignmentStatusDTO {
  @IsEnum(TruckDriverAssignmentStatus)
  status!: TruckDriverAssignmentStatus;
}
