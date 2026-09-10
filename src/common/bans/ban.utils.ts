import { BadRequestException } from '@nestjs/common';

import { BAN_TYPE, type BanType } from './ban.constants';
import type { BanEntityDTO } from './dto/ban-entity.dto';

export interface BanState {
  isPermanentlyBanned: boolean;
  bannedUntil: Date | null;
}

export interface BanFields extends BanState {
  isBanned: boolean;
}

export interface BanDescription {
  banType: BanType;
  bannedUntil: Date | null;
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isBanActive(state: BanState | null | undefined, at = new Date()): boolean {
  if (!state) return false;
  if (state.isPermanentlyBanned) return true;
  if (!state.bannedUntil) return false;

  return startOfLocalDay(at).getTime() <= startOfLocalDay(state.bannedUntil).getTime();
}

export function toBanFields(state: BanState, at = new Date()): BanFields {
  return {
    isPermanentlyBanned: state.isPermanentlyBanned,
    bannedUntil: state.bannedUntil,
    isBanned: isBanActive(state, at),
  };
}

export function formatBanUntilDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function describeBan(state: BanState): BanDescription {
  if (state.isPermanentlyBanned) {
    return { banType: BAN_TYPE.permanent, bannedUntil: null };
  }

  return { banType: BAN_TYPE.untilDate, bannedUntil: state.bannedUntil };
}

export function toBanMetadata(state: BanState): { banType: BanType; bannedUntil: string | null } {
  const ban = describeBan(state);
  return {
    banType: ban.banType,
    bannedUntil: ban.bannedUntil ? formatBanUntilDate(ban.bannedUntil) : null,
  };
}

export function buildBanUpdateData(body: BanEntityDTO, at = new Date()): BanState {
  if (body.isPermanent) {
    if (body.until) {
      throw new BadRequestException('A permanent ban cannot include an until date');
    }

    return { isPermanentlyBanned: true, bannedUntil: null };
  }

  if (!body.until) {
    throw new BadRequestException('A timed ban requires an until date');
  }

  const bannedUntil = parseCalendarDate(body.until);
  if (startOfLocalDay(bannedUntil).getTime() < startOfLocalDay(at).getTime()) {
    throw new BadRequestException('Ban until date must be today or in the future');
  }

  return { isPermanentlyBanned: false, bannedUntil };
}

export function buildLiftBanUpdateData(): BanState {
  return { isPermanentlyBanned: false, bannedUntil: null };
}
