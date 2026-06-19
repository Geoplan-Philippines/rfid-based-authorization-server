import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateAssignmentDTO } from './dto/create-assignment.dto';
import { GetAllAssignmentsQueryDTO } from './dto/get-all-assignments-query.dto';
import { UpdateAssignmentStatusDTO } from './dto/update-assignment-status.dto';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { TruckDriverAssignmentWithRelations } from './types/truck-driver-assignment.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('truck-driver-assignment')
@UseGuards(PassportJwtGuard)
export class TruckDriverAssignmentController {
  constructor(private readonly truckDriverAssignmentService: TruckDriverAssignmentService) {}

  @Post()
  async createAssignment(
    @Body() body: CreateAssignmentDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TruckDriverAssignmentWithRelations> {
    return this.truckDriverAssignmentService.createAssignment(body, user.id);
  }

  @Get()
  async getAllAssignments(
    @Query() query: GetAllAssignmentsQueryDTO,
  ): Promise<PaginatedResponse<TruckDriverAssignmentWithRelations>> {
    return this.truckDriverAssignmentService.getAllAssignments(query);
  }

  @Patch(':truckId/:driverId')
  async updateAssignmentStatus(
    @Param('truckId', ParseUUIDPipe) truckId: string,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: UpdateAssignmentStatusDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TruckDriverAssignmentWithRelations> {
    return this.truckDriverAssignmentService.updateAssignmentStatus(
      truckId,
      driverId,
      body,
      user.id,
    );
  }

  @Delete(':truckId/:driverId')
  async deleteAssignment(
    @Param('truckId', ParseUUIDPipe) truckId: string,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TruckDriverAssignmentWithRelations> {
    return this.truckDriverAssignmentService.deleteAssignment(truckId, driverId, user.id);
  }
}
