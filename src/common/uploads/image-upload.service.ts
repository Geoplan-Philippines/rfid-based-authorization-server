import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { FaceAngle } from '@prisma/client';
import sharp from 'sharp';

type RegistryPhotoFolder = 'drivers' | 'trucks';

// Enrollment: one full capture per angle, filed under the driver being enrolled.
// Attempt: the best frame of a gate capture burst, filed by day for retention purposes
// (FACE_SNAPSHOT_RETENTION_DAYS purges by date — see docs/face/plan/04-data-model.md §4.5/§4.7).
export type FaceImageTarget =
  | { kind: 'enrollment'; driverId: string; angle: FaceAngle }
  | { kind: 'attempt'; attemptId: string };

const ENROLLMENT_MAX_DIMENSION_PX = 1024;
const ENROLLMENT_JPEG_QUALITY = 85;
const ATTEMPT_MAX_DIMENSION_PX = 800;
const ATTEMPT_JPEG_QUALITY = 80;

@Injectable()
export class ImageUploadService {
  async saveRegistryPhoto(file: Express.Multer.File | undefined, folder: RegistryPhotoFolder): Promise<string> {
    if (!file) throw new BadRequestException('Photo file is required');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Only image uploads are allowed');

    const uploadDirectory = join(process.cwd(), 'uploads', folder);
    await mkdir(uploadDirectory, { recursive: true });

    const fileName = `${randomUUID()}.jpg`;
    const filePath = join(uploadDirectory, fileName);

    try {
      await sharp(file.buffer)
        .rotate()
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toFile(filePath);
    } catch {
      throw new BadRequestException('Uploaded file is not a valid image');
    }

    return `/uploads/${folder}/${fileName}`;
  }

  // Higher max dimension and JPEG quality than saveRegistryPhoto: JPEG artefacts at q75
  // measurably shift face embeddings, so face captures get more headroom than registry photos.
  async saveFaceImage(file: Express.Multer.File | undefined, target: FaceImageTarget): Promise<string> {
    if (!file) throw new BadRequestException('Photo file is required');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Only image uploads are allowed');

    const isEnrollment = target.kind === 'enrollment';
    const maxDimension = isEnrollment ? ENROLLMENT_MAX_DIMENSION_PX : ATTEMPT_MAX_DIMENSION_PX;
    const quality = isEnrollment ? ENROLLMENT_JPEG_QUALITY : ATTEMPT_JPEG_QUALITY;

    const urlSegments = isEnrollment
      ? ['faces', 'enrollment', target.driverId]
      : ['faces', 'attempts', ...todayDateSegments()];
    const fileName = isEnrollment ? `${target.angle.toLowerCase()}-${randomUUID()}.jpg` : `${target.attemptId}.jpg`;

    const uploadDirectory = join(process.cwd(), 'uploads', ...urlSegments);
    await mkdir(uploadDirectory, { recursive: true });
    const filePath = join(uploadDirectory, fileName);

    try {
      await sharp(file.buffer)
        .rotate()
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toFile(filePath);
    } catch {
      throw new BadRequestException('Uploaded file is not a valid image');
    }

    return `/uploads/${[...urlSegments, fileName].join('/')}`;
  }
}

function todayDateSegments(): [string, string, string] {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return [year, month, day];
}
