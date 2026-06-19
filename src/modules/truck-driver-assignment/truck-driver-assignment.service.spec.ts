import { Test, TestingModule } from '@nestjs/testing';

import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { PrismaService } from '../../core/database/prisma.service';

const mockPrismaService = {};

describe('TruckDriverAssignmentService', () => {
  let service: TruckDriverAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TruckDriverAssignmentService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TruckDriverAssignmentService>(TruckDriverAssignmentService);
  
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
