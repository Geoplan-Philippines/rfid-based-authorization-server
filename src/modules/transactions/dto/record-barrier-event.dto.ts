import { IsOptional, IsString, Length } from 'class-validator';

export class RecordBarrierEventDTO {
  // Optional operator note, only meaningful when opening a flagged transaction (manual override),
  // e.g. "tag reader fault, visual check OK". The operator's identity comes from the JWT, not the body.
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reason?: string;
}
