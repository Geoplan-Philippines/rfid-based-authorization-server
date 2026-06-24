import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

type RegistryPhotoFolder = 'drivers' | 'trucks';

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
}
