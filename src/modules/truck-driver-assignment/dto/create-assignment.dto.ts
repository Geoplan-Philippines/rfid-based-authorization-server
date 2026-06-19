import { AssignmentRole } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateAssignmentDTO {
  @IsUUID()
  truckId!: string;

  @IsUUID()
  driverId!: string;

  @IsOptional()
  @IsEnum(AssignmentRole)
  role?: AssignmentRole;
}
