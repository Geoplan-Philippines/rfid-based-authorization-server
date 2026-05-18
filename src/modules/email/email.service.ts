import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { SendEmailDto } from './dto/email.dto';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmail(dto: SendEmailDto) {
    const { to, subject, message } = dto;

    this.logger.log(`Sending email to ${to}`);

    const { data, error } = await this.resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html: `<p>${message}</p>`,
    });

    if (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    this.logger.log(`Email sent successfully. ID: ${data?.id}`);
    return { id: data?.id, message: 'Email sent successfully' };
  }
}
