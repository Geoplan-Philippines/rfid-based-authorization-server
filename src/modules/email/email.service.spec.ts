import { Test, TestingModule } from '@nestjs/testing';
import { Resend } from 'resend';

import { BAN_ENTITY_TYPE, BAN_TYPE } from 'src/common/bans/ban.constants';
import { EmailService } from './email.service';

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(),
    },
  })),
}));

describe('EmailService', () => {
  let service: EmailService;
  let send: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    (Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }),
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
    send = (Resend as unknown as jest.Mock).mock.results.at(-1).value.emails.send;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sends a ban presentation alert with who or what passed, when, and ban type', async () => {
    const occurredAt = new Date('2026-09-09T01:30:00.000Z');

    await service.sendBanPresentationAlert({
      to: ['ops@example.com'],
      presentation: {
        eventCode: 'GATE-abc1234',
        occurredAt,
        entityType: BAN_ENTITY_TYPE.truck,
        subjectName: 'ABC 123',
        identifier: 'ABC 123',
        banType: BAN_TYPE.permanent,
        bannedUntil: null,
      },
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['ops@example.com'],
      subject: 'Banned truck presented at gate — ABC 123',
      html: expect.stringMatching(/Who\/what: Truck ABC 123[\s\S]*When:[\s\S]*Ban type: Permanent/),
    }));
  });
});
