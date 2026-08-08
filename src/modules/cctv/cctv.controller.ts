import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { AnprDetectResult, CctvService, CCTVStreamMetadata } from './cctv.service';
import { AnprWorkerService } from './anpr-worker.service';
import type { AnprLatestState } from './anpr-worker.service';
import { WhepOfferDto } from './dto/whep-offer.dto';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

@Controller('cctv')
@UseGuards(PassportJwtGuard)
export class CctvController {
  constructor(
    private readonly cctvService: CctvService,
    private readonly anprWorker: AnprWorkerService,
  ) {}

  @Get('streams')
  async getStreams(): Promise<{ streams: CCTVStreamMetadata[] }> {
    const streams = await this.cctvService.getStreams();
    return { streams };
  }

  @Post('whep')
  @HttpCode(HttpStatus.OK)
  async handleWhepOffer(@Body() dto: WhepOfferDto): Promise<{ sdp: string }> {
    return this.cctvService.handleWhepOffer(dto);
  }

  /**
   * On-demand: grab a still from the live stream and return ANPR detections for
   * it. Kept for manual testing; the page uses `/anpr/latest` instead.
   */
  @Get('anpr/detect')
  async detectPlates(@Query('streamId') streamId?: string): Promise<AnprDetectResult> {
    return this.cctvService.detectPlatesFromStream(streamId || 'gate_plate');
  }

  /**
   * Latest detections + rolling read log from the continuous server-side ANPR
   * worker. This keeps running regardless of whether the page is open, so the
   * plate-feed just displays whatever the worker has most recently seen.
   */
  @Get('anpr/latest')
  getAnprLatest(): AnprLatestState {
    return this.anprWorker.getState();
  }
}
