/**
 * Email Service for MaiFarm
 * Handles email sending for verification, password reset, and notifications
 */

import { logger, LogCategory } from '../utils/logger'
import crypto from 'crypto'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

class EmailService {
  private readonly isDevelopment = process.env.NODE_ENV === 'development'
  private readonly baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

  /**
   * Generate a secure verification token
   */
  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Generate a password reset token (expires in 1 hour)
   */
  generatePasswordResetToken(): string {
    const token = crypto.randomBytes(32).toString('hex')
    const expires = Date.now() + 3600000 // 1 hour
    return `${token}_${expires}`
  }

  /**
   * Validate a password reset token
   */
  validatePasswordResetToken(token: string): { isValid: boolean; token?: string } {
    if (!token || !token.includes('_')) {
      return { isValid: false }
    }

    const [tokenValue, expiresStr] = token.split('_')
    const expires = parseInt(expiresStr, 10)

    if (Date.now() > expires) {
      return { isValid: false }
    }

    return { isValid: true, token: tokenValue }
  }

  /**
   * Send email (mock implementation for development)
   */
  private async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (this.isDevelopment) {
        // In development, log the email instead of sending
        logger.info(LogCategory.EMAIL, 'Email (Development Mode):')
        logger.info(LogCategory.EMAIL, `To: ${options.to}`)
        logger.info(LogCategory.EMAIL, `Subject: ${options.subject}`)
        logger.info(LogCategory.EMAIL, `Content: ${options.text || 'HTML content'}`)

        // Also log a clickable link for easy testing
        if (options.html.includes('href=')) {
          const linkMatch = options.html.match(/href="([^"]+)"/)
          if (linkMatch) {
            logger.info(LogCategory.EMAIL, `\n🔗 Click here: ${linkMatch[1]}\n`)
          }
        }

        return true
      }

      // Production email sending would go here
      // Integrate with SendGrid, AWS SES, or other email service
      // For now, we'll just log
      logger.warn(LogCategory.EMAIL, 'Production email sending not configured')
      return true

    } catch (error) {
      logger.error(LogCategory.EMAIL, 'Failed to send email:', error)
      return false
    }
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const verificationUrl = `${this.baseUrl}/verify-email/${token}`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Welcome to MaiFarm! 🌱</h1>
        <p>Hi ${userName || 'there'},</p>
        <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}"
             style="display: inline-block; padding: 12px 30px; background-color: #10b981;
                    color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${verificationUrl}</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you didn't create an account with MaiFarm, you can safely ignore this email.
        </p>
      </div>
    `

    const text = `
Welcome to MaiFarm!

Please verify your email address by visiting:
${verificationUrl}

If you didn't create an account with MaiFarm, you can safely ignore this email.
    `

    return this.sendEmail({
      to: email,
      subject: 'Verify your MaiFarm email address',
      html,
      text
    })
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const resetUrl = `${this.baseUrl}/reset-password/${token}`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Password Reset Request</h1>
        <p>Hi ${userName || 'there'},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 30px; background-color: #10b981;
                    color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
        <p style="color: #ef4444; font-weight: bold;">This link will expire in 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you didn't request a password reset, please ignore this email. Your password won't be changed.
        </p>
      </div>
    `

    const text = `
Password Reset Request

We received a request to reset your password. Visit the following link to create a new password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, please ignore this email. Your password won't be changed.
    `

    return this.sendEmail({
      to: email,
      subject: 'Reset your MaiFarm password',
      html,
      text
    })
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, userName?: string): Promise<boolean> {
    const dashboardUrl = `${this.baseUrl}/dashboard`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #10b981;">Welcome to MaiFarm! 🎉</h1>
        <p>Hi ${userName || 'there'},</p>
        <p>Your email has been successfully verified! You're now ready to start creating AI agent farms.</p>
        <h2 style="color: #1f2937;">Getting Started:</h2>
        <ul style="line-height: 1.8;">
          <li>🌱 <strong>Create your first farm</strong> - Launch multiple AI agents to work on your tasks</li>
          <li>🤖 <strong>Configure AI providers</strong> - Choose between Claude, OpenAI, or local models</li>
          <li>📊 <strong>Monitor progress</strong> - Watch your agents collaborate in real-time</li>
          <li>🎯 <strong>Harvest results</strong> - Collect and review the outputs from your farms</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}"
             style="display: inline-block; padding: 12px 30px; background-color: #10b981;
                    color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Go to Dashboard
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Need help? Check out our documentation or reach out to support.
        </p>
      </div>
    `

    const text = `
Welcome to MaiFarm!

Your email has been successfully verified! You're now ready to start creating AI agent farms.

Getting Started:
- Create your first farm - Launch multiple AI agents to work on your tasks
- Configure AI providers - Choose between Claude, OpenAI, or local models
- Monitor progress - Watch your agents collaborate in real-time
- Harvest results - Collect and review the outputs from your farms

Go to Dashboard: ${dashboardUrl}

Need help? Check out our documentation or reach out to support.
    `

    return this.sendEmail({
      to: email,
      subject: 'Welcome to MaiFarm! Your email is verified',
      html,
      text
    })
  }
}

export const emailService = new EmailService()