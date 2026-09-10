import { BadRequestException } from '@nestjs/common';

import { BAN_TYPE } from './ban.constants';
import {
  buildBanUpdateData,
  buildLiftBanUpdateData,
  describeBan,
  isBanActive,
  toBanFields,
} from './ban.utils';

describe('ban.utils', () => {
  const today = new Date(2026, 8, 9, 15, 0, 0);

  describe('isBanActive', () => {
    it('treats a permanent ban as active regardless of until date', () => {
      expect(isBanActive({ isPermanentlyBanned: true, bannedUntil: null }, today)).toBe(true);
    });

    it('treats a timed ban as active on its until date', () => {
      expect(isBanActive({ isPermanentlyBanned: false, bannedUntil: new Date(2026, 8, 9) }, today)).toBe(true);
    });

    it('treats a timed ban as expired after its until date', () => {
      expect(isBanActive({ isPermanentlyBanned: false, bannedUntil: new Date(2026, 8, 8) }, today)).toBe(false);
    });

    it('treats a lifted ban as inactive', () => {
      expect(isBanActive({ isPermanentlyBanned: false, bannedUntil: null }, today)).toBe(false);
    });
  });

  describe('buildBanUpdateData', () => {
    it('stores a permanent ban without an until date', () => {
      expect(buildBanUpdateData({ isPermanent: true }, today)).toEqual({
        isPermanentlyBanned: true,
        bannedUntil: null,
      });
    });

    it('stores a timed ban until the given calendar date', () => {
      expect(buildBanUpdateData({ isPermanent: false, until: '2026-09-30' }, today)).toEqual({
        isPermanentlyBanned: false,
        bannedUntil: new Date(2026, 8, 30),
      });
    });

    it('rejects a permanent ban that also sends an until date', () => {
      expect(() => buildBanUpdateData({ isPermanent: true, until: '2026-09-30' }, today)).toThrow(BadRequestException);
    });

    it('rejects a timed ban without an until date', () => {
      expect(() => buildBanUpdateData({ isPermanent: false }, today)).toThrow(BadRequestException);
    });

    it('rejects an until date that is already in the past', () => {
      expect(() => buildBanUpdateData({ isPermanent: false, until: '2026-09-08' }, today)).toThrow(BadRequestException);
    });
  });

  it('clears both ban fields on lift', () => {
    expect(buildLiftBanUpdateData()).toEqual({ isPermanentlyBanned: false, bannedUntil: null });
  });

  it('describes permanent vs until-date bans for alerts', () => {
    expect(describeBan({ isPermanentlyBanned: true, bannedUntil: null })).toEqual({
      banType: BAN_TYPE.permanent,
      bannedUntil: null,
    });
    expect(describeBan({ isPermanentlyBanned: false, bannedUntil: new Date(2026, 8, 30) })).toEqual({
      banType: BAN_TYPE.untilDate,
      bannedUntil: new Date(2026, 8, 30),
    });
  });

  it('exposes computed eligibility on mapped ban fields', () => {
    expect(toBanFields({ isPermanentlyBanned: false, bannedUntil: new Date(2026, 8, 9) }, today)).toEqual({
      isPermanentlyBanned: false,
      bannedUntil: new Date(2026, 8, 9),
      isBanned: true,
    });
  });
});
