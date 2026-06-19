import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

// Stage 2 — what the plate-recognition (OCR) service POSTs after reading the plate.
// Patches the latest open transaction. The backend decides the match (read vs the truck's
// registered plate); the OCR service only reports what it saw + how confident it was.
// The same CCTV frame yields two snapshots: the cropped plate (PLATE) and the full truck shot (WIDE).
export class RecordPlateReadDTO {
  @IsString()
  @Length(1, 32)
  plateNumberRead!: string;

  // OCR confidence, 0..1.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  plateConfidence?: number;

  // URL of the cropped plate snapshot, once capture storage exists.
  @IsOptional()
  @IsString()
  snapshotUrl?: string;

  // URL of the full-frame truck snapshot (WIDE) from the same camera.
  @IsOptional()
  @IsString()
  wideSnapshotUrl?: string;
}
