import { BAN_TYPE, type BanEntityType, type BanType } from 'src/common/bans/ban.constants';

export interface BanPresentationAlert {
  eventCode: string;
  occurredAt: Date;
  entityType: BanEntityType;
  subjectName: string;
  identifier: string;
  banType: BanType;
  bannedUntil: Date | null;
}

export class SendBanPresentationAlertDto {
  to!: string[];
  presentation!: BanPresentationAlert;
}
