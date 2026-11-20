import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const PLACEHOLDER_HOSTS = ['smtp.example.com', 'smtp.example.org', 'localhost', '127.0.0.1'];

@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = (config.get<string>('SMTP_HOST') ?? '').trim();
    if (!host || PLACEHOLDER_HOSTS.includes(host)) {
      this.log.log('SMTP_HOST not configured — transactional emails will be logged locally.');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get('SMTP_PORT') ?? 587),
      secure: false,
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  private async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM') ?? 'Pak-Tel <support@pak-tel.com>';
    if (!this.transporter) {
      this.log.debug(`[MAIL] to=${to} subject="${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({ from, to, subject, text, html });
    } catch (e) {
      this.log.error(`Failed to send mail to ${to}: ${(e as Error).message}`);
    }
  }

  async sendVerifyEmail(to: string, token: string): Promise<void> {
    const baseUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://pak-tel.com';
    const url = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Verify your Pak-Tel email address',
      `Welcome to Pak-Tel!\n\nVerify your email: ${url}\n\nThis link expires in 48 hours.`,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const baseUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://pak-tel.com';
    const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Reset your Pak-Tel password',
      `Reset your password here: ${url}\n\nThis link expires in 2 hours.`,
    );
  }

  async sendEsimReadyEmail(params: {
    to: string;
    orderNumber: string;
    planName: string;
    iccid: string;
    activationCode: string;
    iosTapLink?: string | null;
  }): Promise<void> {
    const lines = [
      `Your Pak-Tel eSIM (${params.planName}) is ready!`,
      `Order: ${params.orderNumber}`,
      `ICCID: ${params.iccid}`,
      `Activation Code (LPA): ${params.activationCode}`,
      params.iosTapLink ? `Install on iPhone: ${params.iosTapLink}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await this.send(params.to, `Your Pak-Tel eSIM is ready (${params.orderNumber})`, lines);
  }

  async sendTopUpCompletedEmail(params: {
    to: string;
    iccid: string;
    planName: string;
  }): Promise<void> {
    await this.send(
      params.to,
      `Pak-Tel eSIM Reloaded (${params.iccid})`,
      `Your Pak-Tel eSIM (${params.iccid}) has been reloaded with ${params.planName}.`,
    );
  }
}
