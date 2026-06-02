import { Test, TestingModule } from '@nestjs/testing';
import { TruckDriverAssignmentController } from './truck-driver-assignment.controller';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';

describe('TruckDriverAssignmentController', () => {
  let controller: TruckDriverAssignmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TruckDriverAssignmentController],
      providers: [TruckDriverAssignmentService],
    }).compile();

    controller = module.get<TruckDriverAssignmentController>(TruckDriverAssignmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
