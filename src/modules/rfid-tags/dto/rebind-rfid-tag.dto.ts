import { IsUUID } from 'class-validator';

export class RebindRfidTagDTO {
  @IsUUID()
  assignedTruckId!: string;
}
