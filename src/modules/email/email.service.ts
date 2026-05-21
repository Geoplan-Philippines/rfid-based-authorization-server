import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { SendEmailDto } from './dto/email.dto';
import { env } from 'src/core/config/env.config';

@Injectable()
export class EmailService {
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
}
