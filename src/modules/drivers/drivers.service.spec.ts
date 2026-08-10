import { Test, TestingModule } from '@nestjs/testing';
import { DriversService } from './drivers.service';
import { PrismaService } from '../../core/database/prisma.service';
import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('DriversService', () => {
  let service: DriversService;

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

    service = module.get<DriversService>(DriversService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});