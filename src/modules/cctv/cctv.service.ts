import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { WhepOfferDto } from './dto/whep-offer.dto';

export interface CCTVStreamMetadata {
  id: string;
  name: string;
  channel: string;
  resolution: string;
  isOnline: boolean;
}

@Injectable()
export class CctvService {
  private readonly logger = new Logger(CctvService.name);
  private readonly go2rtcUrl = process.env.GO2RTC_API_URL || 'http://127.0.0.1:1984';

  async getStreams(): Promise<CCTVStreamMetadata[]> {
    let isOnline = false;
    try {
      const res = await fetch(`${this.go2rtcUrl}/api/streams`);
      if (res.ok) {
        isOnline = true;
      }
    } catch {
      this.logger.warn(`go2rtc service unreachable at ${this.go2rtcUrl}`);
      isOnline = false;
    }

    return [
      {
        id: 'eagle_cam_sub',
        name: 'Eagle Cement Sub Stream (Fast)',
        channel: 'Channel 102',
        resolution: 'SD (Fast Load)',
        isOnline,
      },
      {
        id: 'eagle_cam_main',
        name: 'Eagle Cement Main Stream (HD)',
        channel: 'Channel 101',
        resolution: 'HD 720p/1080p',
        isOnline,
      },
    ];
  }

  async handleWhepOffer(dto: WhepOfferDto): Promise<{ sdp: string }> {
    const streamId = dto.streamId || 'eagle_cam_sub';
    const url = `${this.go2rtcUrl}/api/webrtc?src=${encodeURIComponent(streamId)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: dto.sdp,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`WHEP SDP offer failed on go2rtc: ${response.status} - ${errorText}`);
        throw new ServiceUnavailableException('Failed to establish WebRTC media connection with camera gateway');
      }

      const sdpAnswer = await response.text();
      return { sdp: sdpAnswer };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.error(`Error connecting to go2rtc WHEP endpoint: ${err}`);
      throw new ServiceUnavailableException('CCTV streaming service is currently offline or unreachable');
    }
  }
}
