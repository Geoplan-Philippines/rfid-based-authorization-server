import { BAN_ENTITY_TYPE, BAN_TYPE } from 'src/common/bans/ban.constants';
import { BanPresentationAlertMapper } from './ban-presentation-alert.mapper';

describe('BanPresentationAlertMapper', () => {
  const occurredAt = new Date('2026-09-09T01:30:00.000Z');

  it('includes who, when, and permanent ban type for a banned truck', () => {
    const email = BanPresentationAlertMapper.buildEmail({
      eventCode: 'GATE-abc1234',
      occurredAt,
      entityType: BAN_ENTITY_TYPE.truck,
      subjectName: 'ABC 123',
      identifier: 'ABC 123',
      banType: BAN_TYPE.permanent,
      bannedUntil: null,
    });

    expect(email.subject).toBe('Banned truck presented at gate — ABC 123');
    expect(email.html).toContain('Who/what: Truck ABC 123');
    expect(email.html).toContain('When:');
    expect(email.html).toContain('Ban type: Permanent');
    expect(email.html).toContain('Event: GATE-abc1234');
  });

  it('includes who, when, and until-date ban type for a banned driver', () => {
    const email = BanPresentationAlertMapper.buildEmail({
      eventCode: 'GATE-xyz9876',
      occurredAt,
      entityType: BAN_ENTITY_TYPE.driver,
      subjectName: 'Juan Dela Cruz',
      identifier: 'N01-23-456789',
      banType: BAN_TYPE.untilDate,
      bannedUntil: new Date(2026, 11, 31),
    });

    expect(email.subject).toBe('Banned driver presented at gate — Juan Dela Cruz');
    expect(email.html).toContain('Who/what: Driver Juan Dela Cruz (N01-23-456789)');
    expect(email.html).toContain('Ban type: Until 2026-12-31');
  });
});
