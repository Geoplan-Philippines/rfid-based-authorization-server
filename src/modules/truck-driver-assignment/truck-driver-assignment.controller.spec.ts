import { Test, TestingModule } from '@nestjs/testing';

import { TruckDriverAssignmentController } from './truck-driver-assignment.controller';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const mockPrismaService = {};

describe('TruckDriverAssignmentController', () => {
  let controller: TruckDriverAssignmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TruckDriverAssignmentController],
      providers: [
        TruckDriverAssignmentService,
        AuditLogsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<TruckDriverAssignmentController>(TruckDriverAssignmentController);
  
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
