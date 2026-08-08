import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { AnprDetectResult, CctvService, CCTVStreamMetadata } from './cctv.service';
import { WhepOfferDto } from './dto/whep-offer.dto';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

@Controller('cctv')
@UseGuards(PassportJwtGuard)
export class CctvController {
  constructor(private readonly cctvService: CctvService) {}

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
   * Grab a still from the live stream and return ANPR plate detections for it.
   * Polled by the plate-feed page to overlay boxes on the live preview.
   */
  @Get('anpr/detect')
  async detectPlates(@Query('streamId') streamId?: string): Promise<AnprDetectResult> {
    return this.cctvService.detectPlatesFromStream(streamId || 'gate_plate');
  }
}
