import { BadRequestException } from '@nestjs/common';

import { BAN_TYPE, type BanType } from './ban.constants';
import type { BanEntityDTO } from './dto/ban-entity.dto';

export interface BanState {
  isPermanentlyBanned: boolean;
  bannedFrom: Date | null;
  bannedUntil: Date | null;
}

export interface BanFields extends BanState {
  isBanned: boolean;
}

export interface BanDescription {
  banType: BanType;
  bannedFrom: Date | null;
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

  const current = startOfLocalDay(at).getTime();
  const until = startOfLocalDay(state.bannedUntil).getTime();

  if (state.bannedFrom) {
    const from = startOfLocalDay(state.bannedFrom).getTime();
    return current >= from && current <= until;
  }

  return current <= until;
}

export function toBanFields(state: BanState, at = new Date()): BanFields {
  return {
    isPermanentlyBanned: state.isPermanentlyBanned,
    bannedFrom: state.bannedFrom ?? null,
    bannedUntil: state.bannedUntil ?? null,
    isBanned: isBanActive(state, at),
  };
}

export function formatBanDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const formatBanUntilDate = formatBanDate;

export function describeBan(state: BanState): BanDescription {
  if (state.isPermanentlyBanned) {
    return { banType: BAN_TYPE.permanent, bannedFrom: null, bannedUntil: null };
  }

  return {
    banType: BAN_TYPE.untilDate,
    bannedFrom: state.bannedFrom ?? null,
    bannedUntil: state.bannedUntil ?? null,
  };
}

export function toBanMetadata(state: BanState): {
  banType: BanType;
  bannedFrom: string | null;
  bannedUntil: string | null;
} {
  const ban = describeBan(state);
  return {
    banType: ban.banType,
    bannedFrom: ban.bannedFrom ? formatBanDate(ban.bannedFrom) : null,
    bannedUntil: ban.bannedUntil ? formatBanDate(ban.bannedUntil) : null,
  };
}

export function buildBanUpdateData(body: BanEntityDTO, at = new Date()): BanState {
  const isPermanent = body.permanent ?? body.isPermanent;

  if (isPermanent === undefined) {
    throw new BadRequestException('A ban must specify whether it is permanent or timed');
  }

  if (isPermanent) {
    if (body.from || body.to || body.until) {
      throw new BadRequestException('A permanent ban cannot include from or to dates');
    }

    return { isPermanentlyBanned: true, bannedFrom: null, bannedUntil: null };
  }

  const toStr = body.to ?? body.until;
  if (!toStr) {
    throw new BadRequestException('A timed ban requires a to date');
  }

  const bannedUntil = parseCalendarDate(toStr);
  // An explicitly-provided `from` date may be today or in the future, or in the past
  // for retroactive incident logging and manual corrections.
  // The ban end date (`to`) must still be today or later, and `from` must be on or before `to`.
  const bannedFrom = body.from ? parseCalendarDate(body.from) : startOfLocalDay(at);

  if (startOfLocalDay(bannedFrom).getTime() > startOfLocalDay(bannedUntil).getTime()) {
    throw new BadRequestException('Ban from date must be on or before to date');
  }

  if (startOfLocalDay(bannedUntil).getTime() < startOfLocalDay(at).getTime()) {
    throw new BadRequestException('Ban to date must be today or in the future');
  }

  return { isPermanentlyBanned: false, bannedFrom, bannedUntil };
}

export function buildLiftBanUpdateData(): BanState {
  return { isPermanentlyBanned: false, bannedFrom: null, bannedUntil: null };
}
