import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

function createImageOnlyFileFilter(): MulterOptions['fileFilter'] {
  return (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new BadRequestException('Only image uploads are allowed'), false);
      return;
    }

    callback(null, true);
  };
}

export const MAX_IMAGE_UPLOAD_BYTES = 1_000_000;

export const IMAGE_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
  fileFilter: createImageOnlyFileFilter(),
};

// Higher than MAX_IMAGE_UPLOAD_BYTES: a 1080p webcam still frame routinely exceeds 1 MB, and face
// enrollment/attempt captures need the headroom registry photos don't.
export const MAX_FACE_UPLOAD_BYTES = 4_000_000;

export const FACE_IMAGE_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FACE_UPLOAD_BYTES },
  fileFilter: createImageOnlyFileFilter(),
};
