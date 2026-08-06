import { Test, TestingModule } from '@nestjs/testing';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: {
    getDailySummaryReport: jest.Mock;
    getMonthlyBreakdownReport: jest.Mock;
    getExceptionsReport: jest.Mock;
    getPeakHoursReport: jest.Mock;
  };

  beforeEach(async () => {
    reportsService = {
      getDailySummaryReport: jest.fn(),
      getMonthlyBreakdownReport: jest.fn(),
      getExceptionsReport: jest.fn(),
      getPeakHoursReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: reportsService },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('delegates every report query to the matching service method', async () => {
    const dailyQuery = { date: '2026-07-14' };
    const monthlyQuery = { month: '2026-07' };
    const exceptionsQuery = { from: '2026-07-08', to: '2026-07-14', page: 1, limit: 20 };
    const peakHoursQuery = { from: '2026-06-15', to: '2026-07-14' };

    reportsService.getDailySummaryReport.mockResolvedValue({});
    reportsService.getMonthlyBreakdownReport.mockResolvedValue({});
    reportsService.getExceptionsReport.mockResolvedValue({});
    reportsService.getPeakHoursReport.mockResolvedValue({});

    await controller.getDailySummaryReport(dailyQuery);
    await controller.getMonthlyBreakdownReport(monthlyQuery);
    await controller.getExceptionsReport(exceptionsQuery);
    await controller.getPeakHoursReport(peakHoursQuery);

    expect(reportsService.getDailySummaryReport).toHaveBeenCalledWith(dailyQuery);
    expect(reportsService.getMonthlyBreakdownReport).toHaveBeenCalledWith(monthlyQuery);
    expect(reportsService.getExceptionsReport).toHaveBeenCalledWith(exceptionsQuery);
    expect(reportsService.getPeakHoursReport).toHaveBeenCalledWith(peakHoursQuery);
  });
});
