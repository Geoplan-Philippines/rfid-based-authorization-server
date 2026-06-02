import { Test, TestingModule } from '@nestjs/testing';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';

describe('TruckDriverAssignmentService', () => {
  let service: TruckDriverAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TruckDriverAssignmentService],
    }).compile();

    service = module.get<TruckDriverAssignmentService>(TruckDriverAssignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
