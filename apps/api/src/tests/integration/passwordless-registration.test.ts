import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Unmock database connection for integration tests
jest.unmock('../../database/connection');

import { db } from '../../database/connection';
import { emailService } from '../../services/emailService';
import app from '../test-app';

const request = require('supertest');

// Mock email service to prevent actual email sending during tests
jest.mock('../../services/emailService', () => ({
  emailService: {
    generateVerificationToken: jest.fn(() => 'test-verification-token-' + Date.now()),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendWelcomeEmail: jest.fn().mockResolvedValue(true)
  }
}));

describe('Passwordless Registration & Email Verification Flow', () => {
  let testEmail: string;
  let verificationToken: string | undefined;
  let userId: string | undefined;

  beforeAll(async () => {
    await db.query('SELECT 1');
  });

  beforeEach(() => {
    testEmail = `test-${Date.now()}@passwordless.test`;
    jest.clearAllMocks();
    verificationToken = undefined;
    userId = undefined;
  });

  afterAll(async () => {
    await db.query("DELETE FROM users WHERE email LIKE '%@passwordless.test'");
  });

  describe('Passwordless Registration', () => {
    it('should successfully register a passwordless user', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Passwordless Test User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.requiresVerification).toBe(true);
      expect(response.body.message).toContain('verify');

      userId = response.body.user.id;
    });

    it('should create user with email_verified=false for passwordless mode', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Passwordless Test User',
          authMode: 'passwordless'
        });

      const userResult = await db.query(
        'SELECT email_verified, auth_mode, password_hash FROM users WHERE email = $1',
        [testEmail]
      );

      expect(userResult.rows.length).toBe(1);
      const user = userResult.rows[0];
      expect(user.email_verified).toBe(false);
      expect(user.auth_mode).toBe('passwordless');
      expect(user.password_hash).toBeNull();
    });

    it('should reject passwordless registration with password provided', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Test User',
          password: 'ShouldNotBeHere123',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.error).toContain('Passwordless authentication does not require a password');
    });

    it('should reject duplicate email registration', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'First User',
          authMode: 'passwordless'
        });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Second User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_EXISTS');
      expect(response.body.error).toContain('already exists');
      expect(response.body.details.canLogin).toBe(true);
    });
  });

  describe('Email Verification', () => {
    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Verification Test User',
          authMode: 'passwordless'
        });

      userId = registerResponse.body.user.id;

      const tokenResult = await db.query(
        'SELECT email_verification_token FROM users WHERE id = $1',
        [userId]
      );
      verificationToken = tokenResult.rows[0]?.email_verification_token;
    });

    it('should successfully verify email with valid token', async () => {
      expect(verificationToken).toBeDefined();

      const response = await request(app).get(`/auth/verify/${verificationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('verified');

      const userResult = await db.query(
        'SELECT email_verified, email_verification_token FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];
      expect(user.email_verified).toBe(true);
      expect(user.email_verification_token).toBeNull();
    });

    it('should reject verification with invalid token', async () => {
      const response = await request(app).get('/auth/verify/invalid-token-12345');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should reject verification if the token has expired', async () => {
      expect(verificationToken).toBeDefined();

      await db.query(
        'UPDATE users SET email_verification_expires_at = NOW() - INTERVAL \'1 hour\' WHERE id = $1',
        [userId]
      );

      const response = await request(app).get(`/auth/verify/${verificationToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_TOKEN');
      expect(response.body.details.reason).toBe('expired');
    });

    it('should block login before email verification for passwordless users', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: testEmail });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect(response.body.error).toContain('verify your email');
      expect(response.body.details.canResend).toBe(true);
    });

    it('should allow login after successful email verification', async () => {
      await request(app).get(`/auth/verify/${verificationToken}`);

      const response = await request(app)
        .post('/auth/login')
        .send({ email: testEmail });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Resend Verification Email', () => {
    beforeEach(async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Resend Test User',
          authMode: 'passwordless'
        });
    });

    it('should successfully resend verification email', async () => {
      const response = await request(app)
        .post('/auth/send-verification')
        .send({ email: testEmail });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');
      expect(response.body.details.email).toBe(testEmail);
      expect(typeof response.body.details.expiresAt).toBe('string');

      const userResult = await db.query(
        'SELECT email_verification_token FROM users WHERE email = $1',
        [testEmail]
      );
      const newToken = userResult.rows[0]?.email_verification_token;
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(verificationToken);
    });

    it('should reject resend for non-existent email', async () => {
      const response = await request(app)
        .post('/auth/send-verification')
        .send({ email: 'nonexistent@test.com' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    it('should reject resend for already verified email', async () => {
      const tokenResult = await db.query(
        'SELECT email_verification_token FROM users WHERE email = $1',
        [testEmail]
      );
      const token = tokenResult.rows[0]?.email_verification_token;

      await request(app).get(`/auth/verify/${token}`);

      const response = await request(app)
        .post('/auth/send-verification')
        .send({ email: testEmail });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Password-based Registration (Control Group)', () => {
    it('should successfully register a password-based user without email verification', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Password Test User',
          password: 'SecurePassword123',
          authMode: 'password'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.requiresVerification).toBe(false);

      const userResult = await db.query(
        'SELECT email_verified, auth_mode, password_hash FROM users WHERE email = $1',
        [testEmail]
      );
      const user = userResult.rows[0];
      expect(user.email_verified).toBe(true);
      expect(user.auth_mode).toBe('password');
      expect(user.password_hash).toBeDefined();
    });

    it('should reject password mode registration without password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Test User',
          authMode: 'password'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('PASSWORD_REQUIRED');
      expect(response.body.error).toContain('Password is required');
    });

    it('should allow immediate login for password-based users', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Password Test User',
          password: 'SecurePassword123',
          authMode: 'password'
        });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'SecurePassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
    });
  });

  describe('Error Code Coverage', () => {
    it('should return VALIDATION_ERROR for invalid email format', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          name: 'Test User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.fieldErrors).toBeDefined();
    });

    it('should return VALIDATION_ERROR for missing required fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          authMode: 'passwordless'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return USER_NOT_FOUND for login with non-existent email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'AnyPassword123'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('First User Admin Promotion', () => {
    it('should promote first user to admin automatically', async () => {
      await db.query("DELETE FROM users WHERE email LIKE '%@passwordless.test'");

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'First User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.isAdmin).toBe(true);
      expect(response.body.user.roles).toContainEqual(
        expect.objectContaining({ name: 'admin' })
      );
    });

    it('should NOT promote second user to admin', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: `first-${testEmail}`,
          name: 'First User',
          authMode: 'passwordless'
        });

      const secondEmail = `second-${testEmail}`;
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: secondEmail,
          name: 'Second User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.isAdmin).toBe(false);
      expect(response.body.user.roles).not.toContainEqual(
        expect.objectContaining({ name: 'admin' })
      );
    });
  });
});
