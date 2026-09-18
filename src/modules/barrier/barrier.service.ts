import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { env } from 'src/core/config/env.config';

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

@Injectable()
export class BarrierService implements OnModuleInit {
  private readonly logger = new Logger(BarrierService.name);
  private cachedChallenge: DigestChallenge | null = null;
  private nonceCount = 0;

  /**
   * Pre-warm the Digest auth challenge cache on startup so the first barrier
   * trigger doesn't incur a double round-trip (Basic → 401 → Digest retry).
   */
  async onModuleInit(): Promise<void> {
    if (!env.BARRIER_TRIGGER_ENABLED) return;

    try {
      const host = env.BARRIER_CAMERA_HOST;
      const port = env.BARRIER_CAMERA_PORT;
      const baseUrl = `http://${host}:${port}`;
      // A lightweight read-only request to obtain and cache the digest nonce
      await this.executeAuthenticatedRequest(baseUrl, '/cgi-bin/configManager.cgi?action=getConfig&name=AlarmOut');
      this.logger.log(`Digest auth pre-warmed for camera ${host}:${port}`);
    } catch (err) {
      this.logger.warn(`Failed to pre-warm digest auth (barrier will still work on first trigger): ${err}`);
    }
  }

  /**
   * Triggers the Dahua barrier via the Dahua ANPR camera's ALARM_OUT relay.
   *
   * Physical connection:
   *   Camera Brown (ALARM_OUT)     -> Dahua Barrier OPEN (↑)
   *   Camera Green (ALARM_OUT_GND) -> Dahua Barrier GND (GN)
   *
   * The barrier only needs a brief momentary pulse to trigger the open command.
   * The relay release (Mode=2) is fired without awaiting to minimize the time
   * the relay stays closed and the barrier stays in "open command" state.
   *
   * @param reason Description of what triggered the barrier (e.g. "RFID auto-open", "Manual override")
   */
  async triggerBarrier(reason = 'RFID auto-open'): Promise<{ success: boolean; message: string }> {
    if (!env.BARRIER_TRIGGER_ENABLED) {
      this.logger.log(`Barrier trigger disabled by configuration (BARRIER_TRIGGER_ENABLED=false). Reason: ${reason}`);
      return { success: false, message: 'Barrier trigger disabled by config' };
    }

    const host = env.BARRIER_CAMERA_HOST;
    const port = env.BARRIER_CAMERA_PORT;
    const pulseMs = env.BARRIER_PULSE_DURATION_MS;

    this.logger.log(`Initiating barrier open pulse (${pulseMs}ms) via camera ${host}:${port} [${reason}]`);

    try {
      // Step 1: Turn AlarmOut ON (Force Alarm -> closes relay contacts)
      const turnOnSuccess = await this.setAlarmOutState(true);
      if (!turnOnSuccess) {
        this.logger.warn(`Failed to activate camera alarm relay at ${host}:${port}`);
        return { success: false, message: `Could not activate alarm relay on camera ${host}` };
      }

      // Step 2: Hold for pulse duration, then release without blocking
      setTimeout(() => {
        this.setAlarmOutState(false).catch((err) => {
          this.logger.warn(`Failed to release barrier relay: ${err}`);
        });
      }, pulseMs);

      this.logger.log(`Barrier trigger pulse initiated successfully [${reason}]`);
      return { success: true, message: 'Barrier triggered successfully' };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error during barrier trigger: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Sets the camera AlarmOut relay state.
   * @param active true to close relay (pulse ON), false to open relay (pulse OFF)
   */
  private async setAlarmOutState(active: boolean): Promise<boolean> {
    const host = env.BARRIER_CAMERA_HOST;
    const port = env.BARRIER_CAMERA_PORT;
    const baseUrl = `http://${host}:${port}`;

    // Dahua configManager.cgi: Mode=1 is force alarm (ON), Mode=2 is close alarm (OFF), Mode=0 is auto
    const mode = active ? 1 : 2;
    const configPath = `/cgi-bin/configManager.cgi?action=setConfig&AlarmOut[0].Mode=${mode}`;
    const fallbackPath = `/cgi-bin/alarmOut.cgi?action=setOutput&channel=1&status=${active ? 1 : 0}`;

    // Try primary Dahua CGI endpoint
    let res = await this.executeAuthenticatedRequest(baseUrl, configPath);
    if (res.ok) {
      return true;
    }

    // Try fallback endpoint
    res = await this.executeAuthenticatedRequest(baseUrl, fallbackPath);
    return res.ok;
  }

  /**
   * Sends an HTTP request with Dahua Digest and Basic auth support.
   */
  private async executeAuthenticatedRequest(baseUrl: string, path: string): Promise<{ ok: boolean; status: number; text: string }> {
    const url = `${baseUrl}${path}`;
    const user = env.BARRIER_CAMERA_USER;
    const password = env.BARRIER_CAMERA_PASSWORD;

    try {
      // If we have a cached challenge, try Digest Auth upfront
      const headers: Record<string, string> = {};
      if (this.cachedChallenge) {
        headers['Authorization'] = this.buildDigestHeader('GET', path, user, password, this.cachedChallenge);
      } else {
        // Otherwise send Basic Auth as initial attempt
        const basicAuth = Buffer.from(`${user}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
      }

      let response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 401) {
        const authHeader = response.headers.get('www-authenticate');
        if (authHeader && authHeader.toLowerCase().startsWith('digest')) {
          const challenge = this.parseDigestChallenge(authHeader);
          if (challenge) {
            this.cachedChallenge = challenge;
            this.nonceCount = 0;
            const digestHeader = this.buildDigestHeader('GET', path, user, password, challenge);
            response = await fetch(url, {
              method: 'GET',
              headers: { Authorization: digestHeader },
              signal: AbortSignal.timeout(3000),
            });
          }
        }
      }

      const text = await response.text();
      const ok = response.ok && (text.includes('OK') || text.includes('true') || response.status === 200);
      return { ok, status: response.status, text };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed HTTP request to camera ${url}: ${msg}`);
      return { ok: false, status: 0, text: msg };
    }
  }

  private parseDigestChallenge(header: string): DigestChallenge | null {
    const challenge: Partial<DigestChallenge> = {};
    const regex = /(\w+)=["']?([^"',]+)["']?/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(header)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2];
      if (key === 'realm') challenge.realm = value;
      else if (key === 'nonce') challenge.nonce = value;
      else if (key === 'qop') challenge.qop = value;
      else if (key === 'opaque') challenge.opaque = value;
      else if (key === 'algorithm') challenge.algorithm = value;
    }

    if (challenge.realm && challenge.nonce) {
      return challenge as DigestChallenge;
    }
    return null;
  }

  private buildDigestHeader(
    method: string,
    uri: string,
    user: string,
    pass: string,
    challenge: DigestChallenge,
  ): string {
    this.nonceCount++;
    const nc = this.nonceCount.toString(16).padStart(8, '0');
    const cnonce = crypto.randomBytes(8).toString('hex');
    const realm = challenge.realm;
    const nonce = challenge.nonce;
    const qop = challenge.qop;

    const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

    let responseStr = '';
    if (qop && qop.includes('auth')) {
      responseStr = crypto
        .createHash('md5')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
        .digest('hex');

      let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${responseStr}"`;
      if (challenge.opaque) header += `, opaque="${challenge.opaque}"`;
      return header;
    } else {
      responseStr = crypto
        .createHash('md5')
        .update(`${ha1}:${nonce}:${ha2}`)
        .digest('hex');

      let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseStr}"`;
      if (challenge.opaque) header += `, opaque="${challenge.opaque}"`;
      return header;
    }
  }
}
