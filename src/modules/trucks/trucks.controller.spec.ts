import { Test, TestingModule } from '@nestjs/testing';
import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('TrucksController', () => {
  let controller: TrucksController;

  const mockPrismaService = {
    truck: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    driver: {
    findUnique: jest.fn(),
  },
};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrucksController],
      providers: [
        TrucksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        }
      ],
    }).compile();

    controller = module.get<TrucksController>(TrucksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});