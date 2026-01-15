import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import appConfig from '../config/app.config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const mailConfig = appConfig().mail;
    const port = +mailConfig.port;
    const isGmail = mailConfig.host === 'smtp.gmail.com' || mailConfig.host?.includes('gmail');

    const transportOptions: any = {
      host: mailConfig.host,
      port: port,
      secure: port === 465,
    };

    if (isGmail && port === 587) {
      transportOptions.requireTLS = true;
    }

    if (mailConfig.user && mailConfig.password && mailConfig.user.trim() && mailConfig.password.trim()) {
      transportOptions.auth = {
        user: mailConfig.user.trim(),
        pass: mailConfig.password.trim(),
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions);
  }

  async sendOtpCodeToEmail({ name, email, otp }) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        ${process.env.APP_NAME || 'Welcome'}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                        Welcome, ${name}!
                      </h2>
                      <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.6;">
                        Thank you for registering with us! To complete your registration, please verify your email address using the OTP code below.
                      </p>
                      <div style="background-color: #f3f4f6; border: 2px dashed #10b981; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                          Your Verification Code
                        </p>
                        <div style="background-color: #ffffff; border-radius: 6px; padding: 20px; margin: 15px 0; display: inline-block; min-width: 200px;">
                          <span style="font-size: 32px; font-weight: 700; color: #10b981; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                            ${otp}
                          </span>
                        </div>
                        <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 12px;">
                          This code will expire in 5 minutes
                        </p>
                      </div>
                      <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                        If you didn't create an account with us, please ignore this email.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 14px;">
                        Best regards,<br>
                        <strong style="color: #10b981;">${process.env.APP_NAME || 'The Team'}</strong>
                      </p>
                      <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                        This is an automated message, please do not reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: `${process.env.APP_NAME} <${appConfig().mail.from}>`,
        to: email,
        subject: 'Email Verification',
        html: html,
      });

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Error sending OTP email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendMemberInvitation({ user, member, url }) {
    try {
      const html = `
        <p>Hey ${member.fname || member.name}</p>
        <p>You have been invited by ${user.fname} ${user.lname} (${user.email}) to join ${process.env.APP_NAME}.</p>
        <p>${process.env.APP_NAME} lets you manage all your customer conversations conveniently from one place while collaborating with your team.</p>
        <p><a href="${url}">Accept Invitation</a></p>
        <p>Regards,<br>${process.env.APP_NAME}</p>
        <hr>
        <p>If you're having trouble clicking the "Accept Invitation" button, copy and paste the URL below into your web browser:<br>${url}</p>
      `;

      await this.transporter.sendMail({
        from: `${process.env.APP_NAME} <${appConfig().mail.from}>`,
        to: member.email,
        subject: `${user.fname} is inviting you to ${appConfig().app.name}`,
        html: html,
      });

      this.logger.log(`Member invitation email sent to ${member.email}`);
    } catch (error) {
      this.logger.error(`Error sending member invitation email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendVerificationLink(params: { email: string; name: string; token: string; type: string }) {
    try {
      const verificationLink = `${appConfig().app.client_app_url}/verify-email?token=${params.token}&email=${params.email}&type=${params.type}`;
      
      const html = `
        <p>Hello ${params.name},</p>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
      `;

      await this.transporter.sendMail({
        from: appConfig().mail.from,
        to: params.email,
        subject: 'Verify Your Email',
        html: html,
      });

      this.logger.log(`Verification link email sent to ${params.email}`);
    } catch (error) {
      this.logger.error(`Error sending verification link email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendForgotPasswordOtp({ name, email, otp }) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        ${process.env.APP_NAME || 'Password Reset'}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                        Password Reset Request
                      </h2>
                      <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.6;">
                        Hello ${name},<br><br>
                        We received a request to reset your password. Use the OTP code below to verify your identity and proceed with resetting your password.
                      </p>
                      <div style="background-color: #fef2f2; border: 2px dashed #ef4444; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                          Your Reset Code
                        </p>
                        <div style="background-color: #ffffff; border-radius: 6px; padding: 20px; margin: 15px 0; display: inline-block; min-width: 200px;">
                          <span style="font-size: 32px; font-weight: 700; color: #ef4444; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                            ${otp}
                          </span>
                        </div>
                        <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 12px;">
                          This code will expire in 10 minutes
                        </p>
                      </div>
                      <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                        If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
                      </p>
                      <p style="margin: 20px 0 0 0; color: #dc2626; font-size: 14px; font-weight: 600;">
                        ⚠️ For your security, never share this code with anyone.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 14px;">
                        Best regards,<br>
                        <strong style="color: #ef4444;">${process.env.APP_NAME || 'The Team'}</strong>
                      </p>
                      <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                        This is an automated message, please do not reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: `${process.env.APP_NAME} <${appConfig().mail.from}>`,
        to: email,
        subject: 'Password Reset Code',
        html: html,
      });

      this.logger.log(`Forgot password OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Error sending forgot password OTP email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendPasswordResetSuccess({ name, email }) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        ✓ Password Reset Successful
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                        Hello ${name},
                      </h2>
                      <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 16px; line-height: 1.6;">
                        Your password has been successfully reset. You can now log in to your account using your new password.
                      </p>
                      <div style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
                        <div style="width: 60px; height: 60px; background-color: #10b981; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                          <span style="color: #ffffff; font-size: 32px; font-weight: bold;">✓</span>
                        </div>
                        <p style="margin: 0; color: #059669; font-size: 18px; font-weight: 600;">
                          Password Changed Successfully
                        </p>
                      </div>
                      <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                        If you didn't make this change, please contact our support team immediately to secure your account.
                      </p>
                      <p style="margin: 20px 0 0 0; color: #10b981; font-size: 14px; font-weight: 600;">
                        🔒 Your account security is our top priority.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 14px;">
                        Best regards,<br>
                        <strong style="color: #10b981;">${process.env.APP_NAME || 'The Team'}</strong>
                      </p>
                      <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                        This is an automated message, please do not reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: `${process.env.APP_NAME} <${appConfig().mail.from}>`,
        to: email,
        subject: 'Password Reset Successful',
        html: html,
      });

      this.logger.log(`Password reset success email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Error sending password reset success email: ${error.message}`, error.stack);
      throw error;
    }
  }
}
