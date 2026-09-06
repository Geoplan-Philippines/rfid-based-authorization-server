import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Stage 3 — what the face-recognition service (e.g. B&M) POSTs after identifying the driver.
// Patches the latest open transaction. The service sends WHO it recognised (driverId) + how
// confident it was; the backend computes the match (recognised driver vs the truck's assigned
// driver), so the service never needs to know the assignment.
// Omit driverId to represent an unrecognised face (treated as a non-match).
export class RecordFaceReadDTO {
  @IsOptional()
  @IsUUID()
  attemptId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  // Face match confidence, 0..1.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  faceConfidence?: number;

  // URL of the captured face snapshot, once capture storage exists.
  @IsOptional()
  @IsString()
  snapshotUrl?: string;
}
