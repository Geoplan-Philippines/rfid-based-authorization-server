import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { hashApiKey } from '../utils/api-keys.util';

/**
 * Authenticates unattended gate devices/services (e.g. the rfid-bridge) by a key sent in the
 * `x-api-key` header, instead of a human-login JWT. The key is looked up by its SHA-256 hash;
 * a missing, unknown, or revoked key is rejected. Used on the ingestion routes hardware POSTs to.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const provided = context.switchToHttp().getRequest().headers['x-api-key'] as unknown;
    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException('Missing API key');
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(provided) },
      select: { id: true, revokedAt: true },
    });

    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Best-effort "last seen" tracking; never block or fail the request on it.
    void this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

    return true;
  }
}
