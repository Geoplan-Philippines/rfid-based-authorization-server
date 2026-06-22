import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { GetDashboardOverviewQueryDTO } from './dto/get-dashboard-overview-query.dto';
import { DashboardOverview } from './types/dashboard.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

// Read-only analytics powering the admin-console dashboard. JWT-guarded like the other
// operator-facing modules. TODO: Apply RolesGuard and @Roles() once role policy is finalised.
@Controller('dashboard')
@UseGuards(PassportJwtGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getDashboardOverview(@Query() query: GetDashboardOverviewQueryDTO): Promise<DashboardOverview> {
    return this.dashboardService.getDashboardOverview(query);
  }
}
