import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const MAX_IMAGE_UPLOAD_BYTES = 1_000_000;

export const IMAGE_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new BadRequestException('Only image uploads are allowed'), false);
      return;
    }

    callback(null, true);
  },
};
