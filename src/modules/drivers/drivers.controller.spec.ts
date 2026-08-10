import { Test, TestingModule } from '@nestjs/testing';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { PrismaService } from '../../core/database/prisma.service';
import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('DriversController', () => {
  let controller: DriversController;

  const mockPrismaService = {
    driver: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [
        DriversService,
        GateEventAnalyticsService,
        ImageUploadService,
        AuditLogsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        }
      ],
    }).compile();

    controller = module.get<DriversController>(DriversController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});