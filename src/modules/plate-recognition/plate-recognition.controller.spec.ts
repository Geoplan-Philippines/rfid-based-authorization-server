import { Test, TestingModule } from '@nestjs/testing';
import { PlateRecognitionController } from './plate-recognition.controller';
import { PlateRecognitionService } from './plate-recognition.service';
import { PrismaService } from 'src/core/database/prisma.service';

describe('PlateRecognitionController', () => {
  let controller: PlateRecognitionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlateRecognitionController],
      providers: [
        PlateRecognitionService,
        { provide: PrismaService, useValue: { truck: { findMany: jest.fn() } } },
      ],
    }).compile();

    controller = module.get<PlateRecognitionController>(PlateRecognitionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
