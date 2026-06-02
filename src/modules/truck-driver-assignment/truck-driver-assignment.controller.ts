import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CreateAssignmentDTO } from './dto/create-assignment.dto';
import { GetAllAssignmentsQueryDTO } from './dto/get-all-assignments-query.dto';
import { UpdateAssignmentStatusDTO } from './dto/update-assignment-status.dto';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { TruckDriverAssignmentWithRelations } from './types/truck-driver-assignment.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('truck-driver-assignment')
@UseGuards(PassportJwtGuard)
export class TruckDriverAssignmentController {
  constructor(private readonly truckDriverAssignmentService: TruckDriverAssignmentService) {}

  @Post()
  createAssignment(
    @Body() createAssignmentDTO: CreateAssignmentDTO,
  ): Promise<TruckDriverAssignmentWithRelations> {
    return this.truckDriverAssignmentService.createAssignment(createAssignmentDTO);
  }

  @Get()
  getAllAssignments(
    @Query() query: GetAllAssignmentsQueryDTO,
  ): Promise<PaginatedResponse<TruckDriverAssignmentWithRelations>> {
    return this.truckDriverAssignmentService.getAllAssignments(query);
  }

  @Patch(':truckId/:driverId')
  updateAssignmentStatus(
    @Param('truckId', ParseUUIDPipe) truckId: string,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() updateAssignmentStatusDTO: UpdateAssignmentStatusDTO,
  ): Promise<TruckDriverAssignmentWithRelations> {
    return this.truckDriverAssignmentService.updateAssignmentStatus(
      truckId,
      driverId,
      updateAssignmentStatusDTO,
    );
  }
}
