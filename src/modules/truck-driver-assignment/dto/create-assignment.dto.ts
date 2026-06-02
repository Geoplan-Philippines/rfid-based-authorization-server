import { IsUUID } from 'class-validator';

export class CreateAssignmentDTO {
  @IsUUID()
  truckId!: string;

  @IsUUID()
  driverId!: string;
}
