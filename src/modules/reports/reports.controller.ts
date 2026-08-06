import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { GetDailySummaryQueryDTO } from './dto/get-daily-summary-query.dto';
import { GetExceptionsReportQueryDTO } from './dto/get-exceptions-report-query.dto';
import { GetMonthlyBreakdownQueryDTO } from './dto/get-monthly-breakdown-query.dto';
import { GetPeakHoursQueryDTO } from './dto/get-peak-hours-query.dto';
import { ReportsService } from './reports.service';
import type { DailySummaryReport, ExceptionsReport, MonthlyBreakdownReport, PeakHoursReport } from './types/reports.types';

@Controller('reports')
@UseGuards(PassportJwtGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-summary')
  async getDailySummaryReport(@Query() query: GetDailySummaryQueryDTO): Promise<DailySummaryReport> {
    return this.reportsService.getDailySummaryReport(query);
  }

  @Get('monthly-breakdown')
  async getMonthlyBreakdownReport(@Query() query: GetMonthlyBreakdownQueryDTO): Promise<MonthlyBreakdownReport> {
    return this.reportsService.getMonthlyBreakdownReport(query);
  }

  @Get('exceptions')
  async getExceptionsReport(@Query() query: GetExceptionsReportQueryDTO): Promise<ExceptionsReport> {
    return this.reportsService.getExceptionsReport(query);
  }

  @Get('peak-hours')
  async getPeakHoursReport(@Query() query: GetPeakHoursQueryDTO): Promise<PeakHoursReport> {
    return this.reportsService.getPeakHoursReport(query);
  }
}
