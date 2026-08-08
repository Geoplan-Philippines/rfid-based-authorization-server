import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { WhepOfferDto } from './dto/whep-offer.dto';

export interface CCTVStreamMetadata {
  id: string;
  name: string;
  channel: string;
  resolution: string;
  isOnline: boolean;
}

export interface PlateBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlateDetection {
  confidence: number;
  plateText: string;
  textConfidence: number;
  bbox: PlateBoundingBox;
}

export interface AnprDetectResult {
  streamId: string;
  platesDetected: number;
  detections: PlateDetection[];
  /** Native pixel dimensions of the analysed frame (for overlay scaling). */
  frameWidth: number;
  frameHeight: number;
  capturedAt: string;
}

/** Stream ids that exist in go2rtc.yaml; guards against arbitrary src proxying. */
const KNOWN_STREAM_IDS = new Set(['gate_dome', 'gate_face', 'gate_plate']);

@Injectable()
export class CctvService {
  private readonly logger = new Logger(CctvService.name);
  private readonly go2rtcUrl = process.env.GO2RTC_API_URL || 'http://127.0.0.1:1984';
  private readonly anprUrl = process.env.ANPR_SERVICE_URL || 'http://127.0.0.1:9137';

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
        id: 'gate_dome',
        name: 'Gate Dome Camera',
        channel: 'Overview / PTZ',
        resolution: 'HD Main Stream (1080p)',
        isOnline,
      },
      {
        id: 'gate_face',
        name: 'Gate Face Camera',
        channel: 'Driver ID Recognition',
        resolution: 'HD Main Stream (1080p)',
        isOnline,
      },
      {
        id: 'gate_plate',
        name: 'Gate Plate Camera',
        channel: 'Plate Reader',
        resolution: 'HD Main Stream (1080p)',
        isOnline,
      },
    ];
  }

  async handleWhepOffer(dto: WhepOfferDto): Promise<{ sdp: string }> {
    const streamId = dto.streamId || 'gate_dome';
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

  /**
   * Grab a still frame from a live go2rtc stream and run it through the ANPR
   * microservice, returning the detected plates. This is the "live preview"
   * detection path: the Angular player polls this while the WebRTC video plays.
   */
  async detectPlatesFromStream(streamId: string): Promise<AnprDetectResult> {
    const src = KNOWN_STREAM_IDS.has(streamId) ? streamId : 'gate_plate';

    const frame = await this.grabFrame(src);
    const dims = readJpegSize(new Uint8Array(frame));

    let anprJson: {
      platesDetected?: number;
      detections?: PlateDetection[];
    };
    try {
      const form = new FormData();
      form.append('image', new Blob([frame], { type: 'image/jpeg' }), `${src}.jpg`);
      form.append('cameraId', src);

      const res = await fetch(`${this.anprUrl}/detect`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`ANPR /detect failed: ${res.status} - ${body.slice(0, 300)}`);
        throw new ServiceUnavailableException('Plate recognition service returned an error');
      }
      anprJson = (await res.json()) as typeof anprJson;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Error reaching ANPR service at ${this.anprUrl}: ${err}`);
      throw new ServiceUnavailableException('Plate recognition service is offline or unreachable');
    }

    return {
      streamId: src,
      platesDetected: anprJson.platesDetected ?? 0,
      detections: anprJson.detections ?? [],
      frameWidth: dims.width,
      frameHeight: dims.height,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetch a JPEG snapshot from go2rtc. When a stream's producer is cold the
   * endpoint briefly returns an empty 200 while it waits for a keyframe, so we
   * retry a few times before giving up.
   */
  private async grabFrame(src: string): Promise<ArrayBuffer> {
    const url = `${this.go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(src)}`;
    let lastErr = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) return buf;
          lastErr = 'empty frame (stream warming up)';
        } else {
          lastErr = `go2rtc ${res.status}`;
        }
      } catch (err) {
        lastErr = String(err);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    this.logger.warn(`Could not grab frame for '${src}': ${lastErr}`);
    throw new ServiceUnavailableException('Camera stream is not producing frames yet');
  }
}

/**
 * Read a JPEG's pixel dimensions from its SOF marker without decoding it.
 * Returns { width: 0, height: 0 } if the markers can't be found.
 */
function readJpegSize(buf: Uint8Array): { width: number; height: number } {
  // Skip the initial SOI (0xFFD8).
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15 carry the frame size; C4 (DHT), C8, CC are not SOF markers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (buf[offset + 5] << 8) | buf[offset + 6];
      const width = (buf[offset + 7] << 8) | buf[offset + 8];
      return { width, height };
    }
    // Advance by this segment's length (big-endian 16-bit after the marker).
    const segLen = (buf[offset + 2] << 8) | buf[offset + 3];
    offset += 2 + segLen;
  }
  return { width: 0, height: 0 };
}
