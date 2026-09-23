import { BAN_TYPE } from 'src/common/bans/ban.constants';
import { formatBanDate } from 'src/common/bans/ban.utils';
import type { BanPresentationAlert } from '../dto/send-ban-presentation-alert.dto';

export class BanPresentationAlertMapper {
  public static buildVariables(presentation: BanPresentationAlert): Record<string, string | number> {
    const when = BanPresentationAlertMapper.formatDateTime(presentation.occurredAt);
    const banType = BanPresentationAlertMapper.banTypeLabel(presentation);
    const bannedFrom = presentation.bannedFrom ? formatBanDate(presentation.bannedFrom) : 'N/A';
    const bannedUntil =
      presentation.banType === BAN_TYPE.permanent
        ? 'Permanent'
        : presentation.bannedUntil
          ? formatBanDate(presentation.bannedUntil)
          : 'Indefinite';

    return {
      eventCode: presentation.eventCode,
      occurredAt: when,
      entityType: presentation.entityType,
      subjectName: presentation.subjectName,
      plateNumber: presentation.subjectName,
      identifier: presentation.identifier,
      banType,
      bannedFrom,
      bannedUntil,
      preheaderText: `SECURITY ALERT: Banned ${presentation.entityType} ${presentation.subjectName} attempted entry at the gate (Event ${presentation.eventCode}). Barrier remained locked.`,
    };
  }
  public static buildEmail(presentation: BanPresentationAlert): { subject: string; html: string } {
    const who = BanPresentationAlertMapper.whoLabel(presentation);
    const when = BanPresentationAlertMapper.formatDateTime(presentation.occurredAt);
    const banType = BanPresentationAlertMapper.banTypeLabel(presentation);

    const listItems: string[] = [
      `<li>Who/what: ${BanPresentationAlertMapper.escapeHtml(who)}</li>`,
      `<li>When: ${BanPresentationAlertMapper.escapeHtml(when)}</li>`,
      `<li>Ban type: ${BanPresentationAlertMapper.escapeHtml(banType)}</li>`,
    ];

    if (presentation.banType !== BAN_TYPE.permanent) {
      if (presentation.bannedFrom) {
        listItems.push(
          `<li>From: ${BanPresentationAlertMapper.escapeHtml(formatBanDate(presentation.bannedFrom))}</li>`,
        );
      }
      if (presentation.bannedUntil) {
        listItems.push(
          `<li>To: ${BanPresentationAlertMapper.escapeHtml(formatBanDate(presentation.bannedUntil))}</li>`,
        );
      }
    }

    listItems.push(`<li>Event: ${BanPresentationAlertMapper.escapeHtml(presentation.eventCode)}</li>`);

    return {
      subject: `Banned ${presentation.entityType.toLowerCase()} presented at gate — ${presentation.subjectName}`,
      html: [
        `<p>${BanPresentationAlertMapper.escapeHtml(who)} presented at the gate and is not eligible as normal verified traffic.</p>`,
        '<ul>',
        ...listItems,
        '</ul>',
      ].join(''),
    };
  }

  private static whoLabel(presentation: BanPresentationAlert): string {
    if (presentation.entityType === 'Truck') {
      return `Truck ${presentation.subjectName}`;
    }

    return `Driver ${presentation.subjectName} (${presentation.identifier})`;
  }

  private static banTypeLabel(presentation: BanPresentationAlert): string {
    if (presentation.banType === BAN_TYPE.permanent) return 'Permanent';
    if (presentation.bannedFrom && presentation.bannedUntil) {
      return `Timed (${formatBanDate(presentation.bannedFrom)} to ${formatBanDate(presentation.bannedUntil)})`;
    }
    if (presentation.bannedUntil) {
      return `Until ${formatBanDate(presentation.bannedUntil)}`;
    }
    return 'Timed';
  }

  private static formatDateTime(value: Date): string {
    return value.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  private static escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
