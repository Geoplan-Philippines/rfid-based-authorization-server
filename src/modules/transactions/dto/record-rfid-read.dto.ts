import { IsString, Length } from 'class-validator';

// Stage 1 — what the RFID reader device POSTs when it reads a tag on the truck.
// Creates a new open transaction (gate event) and validates the tag.
// (Real readers also report RSSI / reader id; omitted until the schema carries them.)
export class RecordRfidReadDTO {
  @IsString()
  @Length(1, 64)
  epcId!: string;
}
