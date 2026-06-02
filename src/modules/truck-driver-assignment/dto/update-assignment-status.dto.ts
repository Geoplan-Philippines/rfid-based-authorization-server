import { IsEnum, IsUUID } from 'class-validator';

import { TruckDriverAssignmentStatus } from '@prisma/client';

export class UpdateAssignmentStatusDTO {
  @IsUUID()
  truckId!: string;

  @IsUUID()
  driverId!: string;

  @IsEnum(TruckDriverAssignmentStatus)
  status!: TruckDriverAssignmentStatus;
}
