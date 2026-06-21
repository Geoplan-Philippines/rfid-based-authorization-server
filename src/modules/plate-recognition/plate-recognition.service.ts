import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from 'src/core/database/prisma.service';
import { env } from 'src/core/config/env.config';
import {
  OcrSpaceResponse,
  PlateRecognitionResult,
  PlateVerificationResult,
  UploadedImageFile,
} from './types/plate-recognition.types';
import { OCR_SPACE_URL, PLATE_DIGITS_FIRST, PLATE_LETTERS_FIRST } from './constants/plate-recognition-contants';

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
    return this.matchRecognition(recognition);
  }

  /**
   * Recognize a plate from a publicly reachable image URL and check it against
   * the registered trucks. OCR.space fetches the URL directly, so we never have
   * to download the image ourselves.
   */
  async verifyFromUrl(imageUrl: string): Promise<PlateVerificationResult> {
    const recognition = await this.recognizeFromUrl(imageUrl);
    return this.matchRecognition(recognition);
  }

  /**
   * Match an OCR recognition result against the registered trucks, or throw a 404
   * with context when nothing readable was found or the plate isn't registered.
   */
  private async matchRecognition(recognition: PlateRecognitionResult): Promise<PlateVerificationResult> {
    const truck = await this.findRegisteredTruck(recognition.candidates);

    if (!truck) {
      // Surface a 404 with context: either nothing readable was found in the image,
      // or a plate was read but isn't registered to any active truck.
      throw new NotFoundException({
        message: recognition.plateNumber
          ? `Plate "${recognition.plateNumber}" is not registered to any truck`
          : 'No plate number could be recognized from the image',
        plateNumber: recognition.plateNumber,
        candidates: recognition.candidates,
        rawText: recognition.rawText,
        registered: false,
      });
    }

    return { ...recognition, registered: true, truck };
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

  /** Recognize a plate from a remote image URL (fetched by OCR.space). */
  private async recognizeFromUrl(imageUrl: string): Promise<PlateRecognitionResult> {
    if (!imageUrl?.trim()) {
      throw new BadRequestException('No image URL was provided');
    }

    const form = new FormData();
    form.append('url', imageUrl.trim());

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
    const found: { value: string; index: number }[] = [];

    for (const match of text.matchAll(PLATE_LETTERS_FIRST)) {
      found.push({ value: `${match[1]}${match[2]}`, index: match.index ?? 0 });
    }
    for (const match of text.matchAll(PLATE_DIGITS_FIRST)) {
      found.push({ value: `${match[1]}${match[2]}`, index: match.index ?? 0 });
    }

    // Keep the order the tokens appear in the image, then drop duplicates.
    found.sort((a, b) => a.index - b.index);

    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const { value } of found) {
      if (!seen.has(value)) {
        seen.add(value);
        candidates.push(value);
      }
    }

    return candidates;
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
