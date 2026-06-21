import { Test, TestingModule } from '@nestjs/testing';
import { PlateRecognitionService } from './plate-recognition.service';
import { PrismaService } from 'src/core/database/prisma.service';

describe('PlateRecognitionService', () => {
  let service: PlateRecognitionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlateRecognitionService,
        { provide: PrismaService, useValue: { truck: { findMany: jest.fn() } } },
      ],
    }).compile();

    service = module.get<PlateRecognitionService>(PlateRecognitionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('plate candidate extraction', () => {
    // extractPlateCandidates is private; access it through a typed cast for unit testing.
    const extract = (text: string): string[] =>
      (service as unknown as { extractPlateCandidates(t: string): string[] }).extractPlateCandidates(
        text,
      );

    it('normalizes a spaced plate to uppercase with no separator', () => {
      expect(extract('Plate: abc 1234')).toEqual(['ABC1234']);
    });

    it('handles a dash separator and 3-digit plates', () => {
      expect(extract('NAA-123')).toEqual(['NAA123']);
    });

    it('deduplicates repeated candidates across lines', () => {
      expect(extract('ABC 1234\nABC1234')).toEqual(['ABC1234']);
    });

    it('returns an empty array when no plate-like token is present', () => {
      expect(extract('no plates here')).toEqual([]);
    });
  });

  describe('normalizePlate', () => {
    it('matches a spaced stored plate against a stripped OCR candidate', () => {
      expect(PlateRecognitionService.normalizePlate('NBC 1234')).toBe(
        PlateRecognitionService.normalizePlate('nbc1234'),
      );
    });
  });
});
