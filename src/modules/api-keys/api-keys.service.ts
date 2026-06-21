import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateApiKeyDTO } from './dto/create-api-key.dto';
import { GetAllApiKeysQueryDTO } from './dto/get-all-api-keys-query.dto';
import { ApiKeyListItem, CreatedApiKey } from './types/api-keys.types';
import { apiKeyDisplayPrefix, generateApiKey, hashApiKey } from './utils/api-keys.util';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

// Columns safe to expose: everything except the secret hash.
const LIST_ITEM_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(createApiKeyDTO: CreateApiKeyDTO): Promise<CreatedApiKey> {
    const key = generateApiKey();

    const created = await this.prisma.apiKey.create({
      data: {
        name: createApiKeyDTO.name.trim(),
        keyHash: hashApiKey(key),
        prefix: apiKeyDisplayPrefix(key),
      },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });

    // The plaintext key is returned exactly once here and never stored.
    return { ...created, key };
  }

  async getAllApiKeys(query: GetAllApiKeysQueryDTO): Promise<PaginatedResponse<ApiKeyListItem>> {
    const { page, limit } = query;

    const [apiKeys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: LIST_ITEM_SELECT,
      }),
      this.prisma.apiKey.count(),
    ]);

    return {
      data: apiKeys,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async revokeApiKey(id: string): Promise<ApiKeyListItem> {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, revokedAt: true },
    });

    if (!existing) throw new NotFoundException('API key not found');
    if (existing.revokedAt) throw new ConflictException('API key is already revoked');

    return this.prisma.apiKey.update({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
      select: LIST_ITEM_SELECT,
    });
  }
}
