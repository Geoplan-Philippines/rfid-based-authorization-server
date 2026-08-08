import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnprDetectResult, CctvService } from './cctv.service';

/** A distinct plate read captured by the continuous worker. */
export interface PlateReadRecord {
  plateText: string;
  confidence: number;
  textConfidence: number;
  capturedAt: string;
}

/** Snapshot of the worker state returned to clients. */
export interface AnprLatestState {
  running: boolean;
  streamId: string;
  intervalMs: number;
  lastError: string | null;
  updatedAt: string | null;
  latest: AnprDetectResult | null;
  recentReads: PlateReadRecord[];
}

/**
 * Continuously runs ANPR against a live stream on the server, independent of any
 * connected client. It grabs a frame from go2rtc, sends it to the ANPR service,
 * and keeps the latest detections + a rolling read log in memory. The plate-feed
 * page reads this via `GET /cctv/anpr/latest`, so detection keeps running even
 * when nobody has the page open.
 */
@Injectable()
export class AnprWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnprWorkerService.name);

  private readonly enabled = (process.env.ANPR_CONTINUOUS_ENABLED ?? 'true') !== 'false';
  private readonly streamId = process.env.ANPR_STREAM_ID || 'gate_plate';
  private readonly intervalMs = Math.max(500, Number(process.env.ANPR_POLL_INTERVAL_MS) || 1500);
  private readonly maxReads = 50;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;

  private latest: AnprDetectResult | null = null;
  private lastError: string | null = null;
  private updatedAt: string | null = null;
  private recentReads: PlateReadRecord[] = [];

  constructor(private readonly cctv: CctvService) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Continuous ANPR disabled (ANPR_CONTINUOUS_ENABLED=false).');
      return;
    }
    this.running = true;
    this.logger.log(
      `Continuous ANPR started for '${this.streamId}' every ${this.intervalMs}ms.`,
    );
    void this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getState(): AnprLatestState {
    return {
      running: this.running,
      streamId: this.streamId,
      intervalMs: this.intervalMs,
      lastError: this.lastError,
      updatedAt: this.updatedAt,
      latest: this.latest,
      recentReads: this.recentReads,
    };
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const result = await this.cctv.detectPlatesFromStream(this.streamId);
      this.latest = result;
      this.updatedAt = new Date().toISOString();
      this.lastError = null;
      this.recordReads(result);
      this.schedule(this.intervalMs);
    } catch (err) {
      // Camera warming up / ANPR briefly down — keep trying, just back off.
      this.lastError = err instanceof Error ? err.message : String(err);
      this.schedule(Math.max(this.intervalMs, 3000));
    }
  }

  /** Prepend newly-read plate texts, de-duplicating a plate that stays in view. */
  private recordReads(result: AnprDetectResult): void {
    const named = result.detections.filter((d) => d.plateText.trim().length > 0);
    if (named.length === 0) return;

    const recentText = this.recentReads[0]?.plateText;
    for (const d of named) {
      const plate = d.plateText.trim();
      if (plate === recentText) continue;
      this.recentReads.unshift({
        plateText: plate,
        confidence: d.confidence,
        textConfidence: d.textConfidence,
        capturedAt: result.capturedAt,
      });
    }
    if (this.recentReads.length > this.maxReads) {
      this.recentReads = this.recentReads.slice(0, this.maxReads);
    }
  }
}
