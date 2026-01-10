import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    // Initialize Gmail SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: this.configService.get<string>('SMTP_USER') || this.configService.get<string>('GMAIL_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD') || this.configService.get<string>('GMAIL_APP_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify transporter configuration
    this.verifyTransporter();
  }

  private async verifyTransporter() {
    try {
      await this.transporter.verify();
      this.logger.log('✅ SMTP transporter verified successfully');
    } catch (error) {
      this.logger.error('❌ SMTP transporter verification failed:', error.message);
      this.logger.warn('⚠️  Email service may not work. Please check GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    }
  }

  async sendEmail(options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    from?: string;
  }): Promise<{ success: boolean; message?: string; messageId?: string; error?: string }> {
    try {
      const fromEmail = options.from || this.configService.get<string>('SMTP_USER') || this.configService.get<string>('GMAIL_USER');

      if (!fromEmail) {
        throw new Error('SMTP_USER or GMAIL_USER must be set in environment variables');
      }

      const mailOptions = {
        from: fromEmail,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      };

      const info = await this.transporter.sendMail(mailOptions);

      this.logger.log(`✅ Email sent successfully to ${options.to}. Message ID: ${info.messageId}`);

      const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      return {
        success: true,
        message: `✅ Email sent successfully to ${recipients}`,
        messageId: info.messageId,
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to send email: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendNotification(options: {
    to: string | string[];
    subject: string;
    message: string;
    html?: string;
  }): Promise<{ success: boolean; message?: string; messageId?: string; error?: string }> {
    // Wrapper for notification emails with default formatting
    const htmlContent = options.html || `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${options.subject}</h2>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          ${options.message.replace(/\n/g, '<br>')}
        </div>
        <p style="color: #666; font-size: 12px;">This is an automated message from ORION AI System.</p>
      </div>
    `;

    const result = await this.sendEmail({
      to: options.to,
      subject: options.subject,
      text: options.message,
      html: htmlContent,
    });

    // Return user-friendly message for notifications
    if (result.success) {
      const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      return {
        success: true,
        message: `📧 Email notification sent to ${recipients} with subject "${options.subject}"`,
        messageId: result.messageId,
      };
    }
    
    return result;
  }
}

