import { Test, TestingModule } from '@nestjs/testing';
import { TrucksService } from './trucks.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('TrucksService', () => {
  let service: TrucksService;

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
      providers: [
        TrucksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        }
      ],
    }).compile();

    service = module.get<TrucksService>(TrucksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});