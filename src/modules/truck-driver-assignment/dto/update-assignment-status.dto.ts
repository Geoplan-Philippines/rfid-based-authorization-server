import { IsEnum, IsOptional } from 'class-validator';

import { AssignmentRole, TruckDriverAssignmentStatus } from '@prisma/client';

export class UpdateAssignmentStatusDTO {
  @IsOptional()
  @IsEnum(TruckDriverAssignmentStatus)
  status?: TruckDriverAssignmentStatus;

  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;
}
