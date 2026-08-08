import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CctvService, CCTVStreamMetadata } from './cctv.service';
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
}
