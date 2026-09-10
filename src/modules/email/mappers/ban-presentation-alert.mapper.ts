import { BAN_TYPE } from 'src/common/bans/ban.constants';
import { formatBanUntilDate } from 'src/common/bans/ban.utils';
import type { BanPresentationAlert } from '../dto/send-ban-presentation-alert.dto';

export class BanPresentationAlertMapper {
  public static buildEmail(presentation: BanPresentationAlert): { subject: string; html: string } {
    const who = BanPresentationAlertMapper.whoLabel(presentation);
    const when = BanPresentationAlertMapper.formatDateTime(presentation.occurredAt);
    const banType = BanPresentationAlertMapper.banTypeLabel(presentation);

    return {
      subject: `Banned ${presentation.entityType.toLowerCase()} presented at gate — ${presentation.subjectName}`,
      html: [
        `<p>${BanPresentationAlertMapper.escapeHtml(who)} presented at the gate and is not eligible as normal verified traffic.</p>`,
        '<ul>',
        `<li>Who/what: ${BanPresentationAlertMapper.escapeHtml(who)}</li>`,
        `<li>When: ${BanPresentationAlertMapper.escapeHtml(when)}</li>`,
        `<li>Ban type: ${BanPresentationAlertMapper.escapeHtml(banType)}</li>`,
        `<li>Event: ${BanPresentationAlertMapper.escapeHtml(presentation.eventCode)}</li>`,
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
    if (!presentation.bannedUntil) return 'Until date';

    return `Until ${formatBanUntilDate(presentation.bannedUntil)}`;
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
