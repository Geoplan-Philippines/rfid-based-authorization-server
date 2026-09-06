import { Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { FacePreviewService } from './face-preview.service';

@Controller('face/preview')
export class FacePreviewController {
  constructor(private readonly preview: FacePreviewService) {}

  /** The only route here that takes a Bearer token; the streams use the ticket it hands out. */
  @Post('ticket')
  @UseGuards(PassportJwtGuard)
  @HttpCode(HttpStatus.OK)
  ticket(@CurrentUser() user: AuthenticatedUser): Promise<{ ticket: string; expiresIn: number }> {
    return this.preview.issueTicket(user.id);
  }

  // Both stream routes take @Res() and return nothing on purpose: that bypasses
  // the global ResponseInterceptor, which would otherwise try to wrap an
  // already-streaming socket in { statusCode, message, data }.
  // @SkipThrottle() because ThrottlerGuard is global and one long-lived
  // connection per operator is the intended usage, not abuse.

  @Get('stream')
  @SkipThrottle()
  async stream(@Query('ticket') ticket: string, @Res() res: Response): Promise<void> {
    await this.preview.streamVideo(ticket, res);
  }

  @Get('detections')
  @SkipThrottle()
  async detections(@Query('ticket') ticket: string, @Res() res: Response): Promise<void> {
    await this.preview.streamDetections(ticket, res);
  }
}
