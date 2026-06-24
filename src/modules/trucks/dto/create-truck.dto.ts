import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTruckDTO {
  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;
}
