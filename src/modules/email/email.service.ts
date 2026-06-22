import { Injectable, Logger } from '@nestjs/common';
import { GateEventResult } from '@prisma/client';
import { Resend } from 'resend';

import { env } from 'src/core/config/env.config';
import { SendEmailDto } from './dto/email.dto';
import { SendTransactionAlertDto } from './dto/send-transaction-alert.dto';
import { TransactionAlertMapper } from './mappers/transaction-alert.mapper';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
  }

  async sendEmail(dto: SendEmailDto) {
    const { to, subject, message } = dto;

    const { data, error } = await this.resend.emails.send({
      from: env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html: `<p>${message}</p>`,
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return { id: data?.id, message: 'Email sent successfully' };
  }

  /**
   * Send the Eagle Cement alert email for a transaction whose result is not VERIFIED.
   * A verified transaction is a normal entry and is skipped (no alert), so this can be called
   * unconditionally after any transaction.
   */
  async sendTransactionAlert(dto: SendTransactionAlertDto) {
    const { to, transaction } = dto;

    if (transaction.result === GateEventResult.VERIFIED) {
      return { skipped: true, message: 'Transaction is verified; no alert sent' };
    }

    const { data, error } = await this.resend.emails.send({
      from: env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      template: {
        id: env.RESEND_EAGLE_CEMENT_TEMPLATE_ID,
        variables: TransactionAlertMapper.buildVariables(transaction),
      },
    });

    if (error) {
      this.logger.error(`Failed to send transaction alert for ${transaction.eventCode}: ${error.message}`);
      throw new Error(`Failed to send transaction alert email: ${error.message}`);
    }

    return { id: data?.id, message: 'Transaction alert email sent successfully' };
  }
}
