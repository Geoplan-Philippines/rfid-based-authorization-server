import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { Readable } from 'node:stream';

import { env } from 'src/core/config/env.config';

const TICKET_TYPE = 'face-preview';

/**
 * Browser-facing proxy for the face service's live preview.
 *
 * Two things force this shape. `<img src>` and `EventSource` cannot send an
 * Authorization header, so the browser authenticates with a short-lived signed
 * ticket in the query string instead of the 30-day login JWT. And the browser
 * must never see FACE_SERVICE_API_KEY, so every byte is proxied.
 *
 * FaceServiceClient is deliberately not reused here: it JSON-parses the body,
 * applies an 8s AbortController timeout and retries. All three are wrong for a
 * stream that is supposed to run until the operator closes the tab.
 */
@Injectable()
export class FacePreviewService {
  private readonly baseUrl = env.FACE_SERVICE_BASE_URL.replace(/\/$/, '');

  constructor(private readonly jwt: JwtService) {}

  async issueTicket(userId: string): Promise<{ ticket: string; expiresIn: number }> {
    this.assertEnabled();

    const expiresIn = env.FACE_PREVIEW_TICKET_TTL_SECONDS;
    const ticket = await this.jwt.signAsync({ sub: userId, typ: TICKET_TYPE }, { expiresIn });

    return { ticket, expiresIn };
  }

  async streamVideo(ticket: string | undefined, res: Response): Promise<void> {
    this.assertEnabled();
    await this.verifyTicket(ticket);
    await this.pipeUpstream(`${this.cameraPath()}/stream.mjpg`, res);
  }

  async streamDetections(ticket: string | undefined, res: Response): Promise<void> {
    this.assertEnabled();
    await this.verifyTicket(ticket);
    await this.pipeUpstream(`${this.cameraPath()}/detections`, res);
  }

  private assertEnabled(): void {
    if (!env.FACE_PREVIEW_ENABLED) {
      throw new NotFoundException('Live face preview is disabled');
    }
  }

  private cameraPath(): string {
    return `/api/v1/face/cameras/${encodeURIComponent(env.FACE_PREVIEW_CAMERA_ID)}`;
  }

  private async verifyTicket(ticket?: string): Promise<void> {
    if (!ticket) throw new UnauthorizedException('Missing preview ticket');

    try {
      const payload = await this.jwt.verifyAsync<{ typ?: string }>(ticket);
      // Without this check a normal 30-day login JWT would work as a stream
      // ticket, which defeats the point of the short TTL.
      if (payload.typ !== TICKET_TYPE) throw new Error('wrong ticket type');
    } catch {
      throw new UnauthorizedException('Invalid or expired preview ticket');
    }
  }

  private async pipeUpstream(path: string, res: Response): Promise<void> {
    const controller = new AbortController();
    // Tab closed -> drop the upstream connection. Without this the face
    // service keeps one open connection (and one pinned preview worker) per
    // abandoned tab, and its subscriber refcount never reaches zero.
    res.on('close', () => controller.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'x-api-key': env.FACE_SERVICE_API_KEY ?? '' },
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException('Face preview stream is unavailable');
    }

    if (!upstream.ok || !upstream.body) {
      throw new ServiceUnavailableException('Face preview stream is unavailable');
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    // helmet() sets Cross-Origin-Resource-Policy: same-origin, and CORS does
    // not apply to <img> — CORP does. Without this the stream loads fine in a
    // plain tab and is silently blocked when embedded from localhost:4200.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.flushHeaders();

    const upstreamStream = Readable.fromWeb(upstream.body as never);
    // Aborting mid-flight surfaces here as an error event. Unhandled, that is
    // an uncaught exception that takes the whole API down every time an
    // operator closes the page.
    upstreamStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    upstreamStream.pipe(res);
  }
}
