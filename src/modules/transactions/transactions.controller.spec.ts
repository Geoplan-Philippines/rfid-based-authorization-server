import { Test, TestingModule } from '@nestjs/testing';
import { GateEventResult } from '@prisma/client';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let transactionsService: {
    getAllTransactions: jest.Mock;
    getTransactionById: jest.Mock;
  };

  beforeEach(async () => {
    transactionsService = {
      getAllTransactions: jest.fn(),
      getTransactionById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards list query filters to the service', async () => {
    const query = {
      page: 1,
      limit: 10,
      search: 'ABC',
      result: GateEventResult.VERIFIED,
    };
    const response = {
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 10,
        lastPage: 0,
        counts: {
          VERIFIED: 0,
          UNKNOWN_TAG: 0,
          FACE_MISMATCH: 0,
          PLATE_MISMATCH: 0,
          MANUAL_OVERRIDE: 0,
          DENIED: 0,
          ERROR: 0,
        },
      },
    };
    transactionsService.getAllTransactions.mockResolvedValue(response);

    await expect(controller.getAllTransactions(query)).resolves.toBe(response);
    expect(transactionsService.getAllTransactions).toHaveBeenCalledWith(query);
  });

  it('forwards detail id to the service', async () => {
    const response = {
      id: 'event-1',
      eventCode: 'GATE-20260617-0001',
      occurredAt: new Date('2026-06-17T00:00:00.000Z'),
      result: GateEventResult.VERIFIED,
      plateRead: 'ABC-123',
      plateMismatch: false,
      verification: null,
      timeline: [],
      rfidTag: null,
      truck: null,
      truckInRegistry: false,
      driver: null,
      faceMatchesAssigned: false,
      snapshots: [],
      isOpen: true,
    };
    transactionsService.getTransactionById.mockResolvedValue(response);

    await expect(controller.getTransactionById('event-1')).resolves.toBe(response);
    expect(transactionsService.getTransactionById).toHaveBeenCalledWith('event-1');
  });
});
