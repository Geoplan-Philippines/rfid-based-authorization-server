import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from 'src/core/database/prisma.service';
import { env } from 'src/core/config/env.config';
import {
  OcrSpaceResponse,
  PlateRecognitionResult,
  PlateVerificationResult,
  UploadedImageFile,
} from './types/plate-recognition.types';

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

// Philippine plates are typically 3 letters + 3-4 digits (e.g. "ABC 1234", "NAA 123").
// We also tolerate a leading separator (space or dash) between the two groups.
const PLATE_PATTERN = /\b([A-Z]{2,3})[\s-]?(\d{3,4})\b/g;

@Injectable()
export class PlateRecognitionService {
  private readonly logger = new Logger(PlateRecognitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recognize a plate from an uploaded image and check it against the registered trucks.
   * Returns the recognition result plus whether a matching truck exists in the database.
   */
  async verifyFromFile(file: UploadedImageFile): Promise<PlateVerificationResult> {
    const recognition = await this.recognizeFromFile(file);
    const truck = await this.findRegisteredTruck(recognition.candidates);

    return { ...recognition, registered: truck !== null, truck };
  }

  /** Recognize a plate from an uploaded image file (in-memory buffer). */
  private async recognizeFromFile(file: UploadedImageFile): Promise<PlateRecognitionResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No image file was provided');
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    form.append('file', blob, file.originalname || 'plate.jpg');

    return this.parse(form);
  }

  private async parse(form: FormData): Promise<PlateRecognitionResult> {
    // Tuned for license plates: engine 2 handles short alphanumeric strings well,
    // and scaling improves accuracy on low-resolution photos.
    form.append('OCREngine', '2');
    form.append('scale', 'true');
    form.append('isOverlayRequired', 'false');

    let response: Response;
    try {
      response = await fetch(OCR_SPACE_URL, {
        method: 'POST',
        headers: { apikey: env.OCR_SPACE_API_KEY },
        body: form,
      });
    } catch (err) {
      this.logger.error('OCR.space request failed', err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException('Plate recognition service is unreachable');
    }

    if (!response.ok) {
      this.logger.error(`OCR.space returned HTTP ${response.status}`);
      throw new ServiceUnavailableException('Plate recognition service returned an error');
    }

    const result = (await response.json()) as OcrSpaceResponse;

    if (result.IsErroredOnProcessing || result.OCRExitCode !== 1) {
      const message = Array.isArray(result.ErrorMessage)
        ? result.ErrorMessage.join('; ')
        : result.ErrorMessage || result.ErrorDetails || 'Unknown OCR error';
      this.logger.warn(`OCR.space processing error: ${message}`);
      throw new BadRequestException(`Could not process image: ${message}`);
    }

    const rawText = (result.ParsedResults ?? [])
      .map((r) => r.ParsedText ?? '')
      .join('\n')
      .trim();

    const candidates = this.extractPlateCandidates(rawText);

    return {
      plateNumber: candidates[0] ?? null,
      candidates,
      rawText,
    };
  }

  /** Pull plate-like tokens out of raw OCR text, normalized to uppercase with no separators. */
  private extractPlateCandidates(rawText: string): string[] {
    const text = rawText.toUpperCase();
    const seen = new Set<string>();

    for (const match of text.matchAll(PLATE_PATTERN)) {
      const normalized = `${match[1]}${match[2]}`;
      if (!seen.has(normalized)) seen.add(normalized);
    }

    return [...seen];
  }

  /**
   * Find the first non-archived truck whose plate matches any recognized candidate.
   * Comparison is done on a normalized form (uppercase, alphanumeric only) so that
   * spacing/punctuation differences between OCR output and stored plates don't matter.
   */
  private async findRegisteredTruck(candidates: string[]) {
    if (candidates.length === 0) return null;

    const wanted = new Set(candidates.map((c) => PlateRecognitionService.normalizePlate(c)));

    // The dataset of trucks is small; fetch active ones and match in memory rather than
    // forcing the OCR output's exact spacing onto a unique DB lookup.
    const trucks = await this.prisma.truck.findMany({ where: { isArchived: false } });

    return (
      trucks.find((t) => wanted.has(PlateRecognitionService.normalizePlate(t.plateNumber))) ?? null
    );
  }

  /** Strip a plate down to uppercase alphanumerics for tolerant comparison. */
  static normalizePlate(plate: string): string {
    return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
