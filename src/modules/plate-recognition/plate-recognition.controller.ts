import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { PlateRecognitionService } from './plate-recognition.service';
import { VerifyByUrlDTO } from './dto/verify-by-url.dto';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from './constants/plate-recognition-constants';
import type { PlateVerificationResult, UploadedImageFile } from './types/plate-recognition.types';

// NOTE: route is unguarded for now to ease server-side testing.
// Add @UseGuards(PassportJwtGuard) before wiring this into the frontend.
@Controller('plate-recognition')
export class PlateRecognitionController {
  constructor(private readonly plateRecognitionService: PlateRecognitionService) {}

  // Upload an image in the `image` form-data field. Recognizes the plate and checks
  // it against the registered trucks in the database.
  @Post('verify')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
      },
    }),
  )
  verifyFromFile(@UploadedFile() image: UploadedImageFile): Promise<PlateVerificationResult> {
    return this.plateRecognitionService.verifyFromFile(image);
  }

  // Send a JSON body { "imageUrl": "https://..." }. OCR.space fetches the image,
  // then we recognize the plate and check it against the registered trucks.
  @Post('verify-url')
  @HttpCode(200)
  verifyFromUrl(@Body() dto: VerifyByUrlDTO): Promise<PlateVerificationResult> {
    return this.plateRecognitionService.verifyFromUrl(dto.imageUrl);
  }
}
