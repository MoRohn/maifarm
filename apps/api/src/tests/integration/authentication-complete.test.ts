/**
 * Comprehensive Authentication Integration Tests
 * Tests all authentication flows including passwordless and password-based accounts
 * Created: 2025-11-05
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { db } from '../../database/connection';

const request = require('supertest');

const API_BASE = process.env.API_URL || 'http://localhost:4567';

describe('Authentication Integration Tests', () => {
  // Clean up before each test
  beforeEach(async () => {
    await db.query('DELETE FROM users WHERE email LIKE \'%@test-auth.com\'');
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE email LIKE \'%@test-auth.com\'');
  });

  describe('Admin Constraint Tests', () => {
    it('should make first user an admin automatically', async () => {
      await db.query('DELETE FROM users'); // Clear all users

      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'first-user@test-auth.com',
          name: 'First User',
          password: 'TestPass123!',
          authMode: 'password'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.isAdmin).toBe(true);
    });

    it('should NOT make second user an admin', async () => {
      await db.query('DELETE FROM users'); // Clear all users

      // Register first user
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'first@test-auth.com',
          name: 'First',
          password: 'Pass123!',
          authMode: 'password'
        });

      // Register second user
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'second@test-auth.com',
          name: 'Second',
          password: 'Pass123!',
          authMode: 'password'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.isAdmin).toBe(false);
    });

    it('should enforce single admin constraint in database', async () => {
      await db.query('DELETE FROM users');

      // Register two users
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'admin@test-auth.com',
          name: 'Admin',
          password: 'Pass123!',
          authMode: 'password'
        });

      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'user@test-auth.com',
          name: 'User',
          password: 'Pass123!',
          authMode: 'password'
        });

      // Try to make second user admin via database update
      try {
        await db.query(
          'UPDATE users SET is_admin = true WHERE email = $1',
          ['user@test-auth.com']
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Only one administrator can be active at a time');
      }

      // Verify only one admin exists
      const result = await db.query('SELECT COUNT(*) as count FROM users WHERE is_admin = true');
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });

  describe('Passwordless Authentication Tests', () => {
    it('should register a passwordless user successfully', async () => {
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'passwordless@test-auth.com',
          name: 'Passwordless User',
          authMode: 'passwordless'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.authMode).toBe('passwordless');
      expect(response.body.accessToken).toBeDefined();
    });

    it('should verify passwordless user has no password hash', async () => {
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'test-no-password@test-auth.com',
          name: 'No Password',
          authMode: 'passwordless'
        });

      const result = await db.query(
        'SELECT password_hash FROM users WHERE email = $1',
        ['test-no-password@test-auth.com']
      );

      expect(result.rows[0].password_hash).toBeNull();
    });

    it('should allow passwordless login without password field', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pl-nopw@test-auth.com',
          name: 'PL User',
          authMode: 'passwordless'
        });

      // Login without password field
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pl-nopw@test-auth.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should allow passwordless login with blank password', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pl-blank@test-auth.com',
          name: 'PL User',
          authMode: 'passwordless'
        });

      // Login with blank password
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pl-blank@test-auth.com',
          password: ''
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should reject passwordless login with a password', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pl-reject@test-auth.com',
          name: 'PL User',
          authMode: 'passwordless'
        });

      // Try to login with password
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pl-reject@test-auth.com',
          password: 'SomePassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('passwordless account');
    });
  });

  describe('Password-Based Authentication Tests', () => {
    it('should register a password user successfully', async () => {
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'password@test-auth.com',
          name: 'Password User',
          password: 'SecurePass123!',
          authMode: 'password'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.authMode).toBe('password');
      expect(response.body.accessToken).toBeDefined();
    });

    it('should verify password user has password hash', async () => {
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'has-pw@test-auth.com',
          name: 'Has Password',
          password: 'Pass123!',
          authMode: 'password'
        });

      const result = await db.query(
        'SELECT password_hash FROM users WHERE email = $1',
        ['has-pw@test-auth.com']
      );

      expect(result.rows[0].password_hash).not.toBeNull();
      expect(result.rows[0].password_hash.length).toBeGreaterThan(0);
    });

    it('should login successfully with correct password', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pw-correct@test-auth.com',
          name: 'PW User',
          password: 'CorrectPass123!',
          authMode: 'password'
        });

      // Login
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pw-correct@test-auth.com',
          password: 'CorrectPass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pw-wrong@test-auth.com',
          name: 'PW User',
          password: 'CorrectPass123!',
          authMode: 'password'
        });

      // Login with wrong password
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pw-wrong@test-auth.com',
          password: 'WrongPassword!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject password login without password field', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pw-nopw@test-auth.com',
          name: 'PW User',
          password: 'Pass123!',
          authMode: 'password'
        });

      // Try to login without password
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pw-nopw@test-auth.com'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Password is required for this account');
    });

    it('should reject password login with blank password', async () => {
      // Register
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'pw-blank@test-auth.com',
          name: 'PW User',
          password: 'Pass123!',
          authMode: 'password'
        });

      // Try to login with blank password
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'pw-blank@test-auth.com',
          password: ''
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Password is required for this account');
    });
  });

  describe('Setup Status Tests', () => {
    it('should report requiresSetup=true when no users exist', async () => {
      await db.query('DELETE FROM users');

      const response = await request(API_BASE)
        .get('/api/auth/setup-status');

      expect(response.status).toBe(200);
      expect(response.body.requiresSetup).toBe(true);
      expect(response.body.isNewInstall).toBe(true);
      expect(response.body.hasAdminUser).toBe(false);
      expect(response.body.totalUsers).toBe(0);
    });

    it('should report requiresSetup=false after first user created', async () => {
      await db.query('DELETE FROM users');

      // Register first user
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'setup-test@test-auth.com',
          name: 'Setup Test',
          password: 'Pass123!',
          authMode: 'password'
        });

      const response = await request(API_BASE)
        .get('/api/auth/setup-status');

      expect(response.status).toBe(200);
      expect(response.body.requiresSetup).toBe(false);
      expect(response.body.isNewInstall).toBe(false);
      expect(response.body.hasAdminUser).toBe(true);
      expect(response.body.totalUsers).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate email registration', async () => {
      // Register first time
      await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test-auth.com',
          name: 'First',
          password: 'Pass123!',
          authMode: 'password'
        });

      // Try to register again with same email
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@test-auth.com',
          name: 'Second',
          password: 'Pass456!',
          authMode: 'password'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should handle login for non-existent user', async () => {
      const response = await request(API_BASE)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test-auth.com',
          password: 'Pass123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should handle registration with invalid email', async () => {
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          name: 'Invalid',
          password: 'Pass123!',
          authMode: 'password'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle registration with short password', async () => {
      const response = await request(API_BASE)
        .post('/api/auth/register')
        .send({
          email: 'short-pw@test-auth.com',
          name: 'Short',
          password: 'short',
          authMode: 'password'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least 8 characters');
    });
  });
});
