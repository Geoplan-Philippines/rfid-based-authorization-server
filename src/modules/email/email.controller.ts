import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/email.dto';
import { SendTransactionAlertDto } from './dto/send-transaction-alert.dto';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @UseGuards(PassportJwtGuard)
  async sendEmail(@Body() dto: SendEmailDto) {
    return this.emailService.sendEmail(dto);
  }

  // Alert reviewers about a transaction that was not VERIFIED (mismatch, denied, manual override,
  // error). Verified transactions are skipped by the service, so callers can fire this for any event.
  @Post('transaction-alert')
  @UseGuards(PassportJwtGuard)
  async sendTransactionAlert(@Body() dto: SendTransactionAlertDto) {
    return this.emailService.sendTransactionAlert(dto);
  }
}
