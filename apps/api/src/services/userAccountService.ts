import * as fs from 'fs'
import * as path from 'path'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../database/connection'
import { userCreationService, EmailExistsError } from './userCreationService'
import { logger, LogCategory } from './ProductionLogger'
import { recordAuthRegistration } from '../monitoring/metricsCollector'
import { shouldEnforceEmailVerification } from '../config/authSettings'

export interface RegisterPayload {
  email: string
  name: string
  password?: string
  authMode: 'password' | 'passwordless'
  username?: string
}

export interface NormalizedUser {
  id: string
  email: string
  name: string
  username: string
  avatar: string | null
  roles: Array<{ id: string; name: string; permissions: string[] }>
  permissions: string[]
  createdAt: string
  updatedAt: string
  lastLogin: string | null
  isAdmin: boolean
  isActive: boolean
  setupCompletedAt: string | null
  preferences: Record<string, any>
  authMode: 'password' | 'passwordless'
  emailVerified: boolean
}

export class UserAccountError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

interface MockUserRecord {
  id: string
  email: string
  username: string
  display_name: string
  password_hash: string | null
  auth_mode: 'password' | 'passwordless'
  email_verified: boolean
  roles: string[]
  permissions: string[]
  is_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
  setup_completed_at: string | null
  avatar_url: string | null
  preferences: Record<string, any>
}

class MockUserStore {
  private filePath: string
  private records: MockUserRecord[] = []

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'var', 'auth', 'mock-users.json')
    this.load()
  }

  private load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      this.records = JSON.parse(raw)
    } catch {
      this.records = []
    }
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2))
  }

  list() {
    return [...this.records]
  }

  findByEmailOrUsername(identifier: { email?: string; username?: string }) {
    const email = identifier.email?.toLowerCase()
    const username = identifier.username?.toLowerCase()
    return this.records.find(record => {
      if (email && record.email.toLowerCase() === email) {
        return true
      }
      if (username && record.username.toLowerCase() === username) {
        return true
      }
      return false
    }) || null
  }

  findById(id: string) {
    return this.records.find(record => record.id === id) || null
  }

  register(payload: RegisterPayload): MockUserRecord {
    const email = payload.email.toLowerCase()
    if (this.findByEmailOrUsername({ email })) {
      throw new UserAccountError('User with this email already exists', 409)
    }

    const now = new Date().toISOString()
    const roles = this.records.length === 0 ? ['admin'] : ['user']
    const passwordHash = payload.authMode === 'password' && payload.password
      ? bcrypt.hashSync(payload.password, 10)
      : null

    const record: MockUserRecord = {
      id: `mock-${uuidv4()}`,
      email,
      username: this.sanitizeUsername(payload.username || payload.name || email.split('@')[0]),
      display_name: payload.name || email,
      password_hash: passwordHash,
      auth_mode: payload.authMode,
      email_verified: true,
      roles,
      permissions: roles.includes('admin') ? ['*'] : [],
      is_admin: roles.includes('admin'),
      is_active: true,
      created_at: now,
      updated_at: now,
      last_login_at: now,
      setup_completed_at: null,
      avatar_url: null,
      preferences: {}
    }

    this.records.push(record)
    this.persist()
    return record
  }

  update(user: MockUserRecord) {
    const idx = this.records.findIndex(record => record.id === user.id)
    if (idx !== -1) {
      this.records[idx] = user
      this.persist()
    }
  }

  private sanitizeUsername(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '')
      .slice(0, 30) || `user_${Date.now().toString().slice(-6)}`
  }
}

class UserAccountService {
  private useDatabase: boolean
  private allowFallback: boolean
  private mockStore: MockUserStore
  private enforceEmailVerification: boolean

  constructor() {
    this.useDatabase = process.env.AUTH_USE_DATABASE !== 'false'
    this.allowFallback = process.env.AUTH_ENABLE_FALLBACK !== 'false'
    this.mockStore = new MockUserStore()
    this.enforceEmailVerification = shouldEnforceEmailVerification()
    this.ensureMockAdminAccount()
  }

  async register(payload: RegisterPayload) {
    const authMode = payload.authMode

    if (this.useDatabase) {
      try {
        const user = await this.registerInDatabase(payload)
        this.trackRegistrationMetric('database', authMode, 'success')
        logger.info(LogCategory.AUTH, 'User registered via primary database', {
          email: payload.email.toLowerCase(),
          authMode
        })
        return { user, source: 'database' as const }
      } catch (error) {
        this.trackRegistrationMetric('database', authMode, 'failure')

        if (error instanceof UserAccountError) {
          logger.warn(LogCategory.AUTH, 'Database registration rejected', {
            email: payload.email.toLowerCase(),
            authMode,
            reason: error.message
          })
          throw error
        }

        if (!this.shouldFallbackToMock(error)) {
          logger.error(LogCategory.AUTH, 'Database registration failed without fallback', {
            email: payload.email.toLowerCase(),
            authMode,
            error: error instanceof Error ? error.message : String(error)
          })
          throw error
        }

        logger.warn(LogCategory.AUTH, 'Database registration failed, falling back to mock store', {
          email: payload.email.toLowerCase(),
          authMode,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const mockUser = this.mockStore.register(payload)
    const fallbackSource = this.useDatabase ? 'mock-fallback' : 'mock'
    this.trackRegistrationMetric(fallbackSource, authMode, 'success')
    logger.info(LogCategory.AUTH, 'User registered via mock store', {
      email: payload.email.toLowerCase(),
      authMode,
      fallback: this.useDatabase
    })
    return { user: this.normalizeMockUser(mockUser), source: 'mock' as const }
  }

  async authenticate(credentials: { email?: string; username?: string; password?: string }) {
    try {
      if (!credentials.email && !credentials.username) {
        throw new UserAccountError('Email or username is required', 400)
      }

      if (this.useDatabase) {
        try {
          const account = await this.findDatabaseAccount(credentials)
          if (account) {
            // Check if account is active
            if (!account.row.is_active) {
              throw new UserAccountError('Your account has been deactivated. Please contact support.', 403)
            }

            await this.ensurePasswordRequirements(account, credentials.password)
            return { user: this.normalizeDbUser(account.row), source: 'database' as const }
          }
        } catch (error) {
          // If it's already a UserAccountError (like wrong password), re-throw it
          if (error instanceof UserAccountError) {
            throw error
          }
          // Only fall back for other types of errors if allowed
          if (!this.allowFallback) {
            throw error
          }
          logger.warn(LogCategory.AUTH, 'Database authentication failed, attempting fallback', {
            email: credentials.email?.toLowerCase() || credentials.username,
            error: error instanceof Error ? error.message : String(error)
          })
        }

        if (!this.allowFallback) {
          throw new UserAccountError('User not found', 404)
        }
      }

      // Only check mock store if we're not using database or if fallback is explicitly allowed
      if (!this.useDatabase || this.allowFallback) {
        const mockUser = this.mockStore.findByEmailOrUsername({ email: credentials.email, username: credentials.username })
        if (mockUser) {
          // Check if account is active
          if (!mockUser.is_active) {
            throw new UserAccountError('Your account has been deactivated. Please contact support.', 403)
          }

          if (mockUser.auth_mode === 'password') {
            if (!credentials.password) {
              throw new UserAccountError('Password is required for this account', 401)
            }
            const valid = await bcrypt.compare(credentials.password, mockUser.password_hash || '')
            if (!valid) {
              throw new UserAccountError('Invalid credentials', 401)
            }
          }

          mockUser.last_login_at = new Date().toISOString()
          this.mockStore.update(mockUser)

          return { user: this.normalizeMockUser(mockUser), source: 'mock' as const }
        }
      }

      throw new UserAccountError('User not found', 404)
    } catch (error) {
      if (error instanceof UserAccountError) {
        throw error
      }
      logger.error(LogCategory.AUTH, 'Unexpected authentication failure', {
        email: credentials.email?.toLowerCase() || credentials.username,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new UserAccountError('Authentication service is temporarily unavailable. Please try again.', 503)
    }
  }

  async getUserById(id: string) {
    if (this.useDatabase) {
      try {
        const result = await db.query(
          `SELECT id, email, username, display_name, roles, permissions, is_admin, is_active,
                  created_at, updated_at, last_login_at, setup_completed_at, avatar_url, preferences
           FROM users WHERE id = $1`,
          [id]
        )
        if (result.rows.length > 0) {
          return { user: this.normalizeDbUser(result.rows[0]), source: 'database' as const }
        }
      } catch (error) {
        if (!this.allowFallback) {
          throw error
        }
        logger.warn(LogCategory.AUTH, 'Failed to fetch user from DB, falling back', {
          userId: id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const mockUser = this.mockStore.findById(id)
    return mockUser
      ? { user: this.normalizeMockUser(mockUser), source: 'mock' as const }
      : { user: null, source: this.useDatabase ? 'database' : 'mock' }
  }

  async completeSetup(userId: string, preferences?: Record<string, any>) {
    if (this.useDatabase) {
      try {
        const result = await db.query(
          `UPDATE users
           SET preferences = COALESCE($2, preferences),
               setup_completed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
           RETURNING setup_completed_at, preferences`,
          [userId, preferences ? JSON.stringify(preferences) : null]
        )

        if (result.rows.length === 0) {
          throw new UserAccountError('User not found', 404)
        }

        return {
          setupCompletedAt: result.rows[0].setup_completed_at,
          preferences: result.rows[0].preferences,
          source: 'database' as const
        }
      } catch (error) {
        if (!this.allowFallback) {
          throw error
        }
        logger.warn(LogCategory.AUTH, 'Failed to complete setup in DB, falling back', {
          userId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const mockUser = this.mockStore.findById(userId)
    if (!mockUser) {
      throw new UserAccountError('User not found', 404)
    }

    if (preferences) {
      mockUser.preferences = { ...(mockUser.preferences || {}), ...preferences }
    }
    mockUser.setup_completed_at = new Date().toISOString()
    mockUser.updated_at = mockUser.setup_completed_at
    this.mockStore.update(mockUser)

    return {
      setupCompletedAt: mockUser.setup_completed_at,
      preferences: mockUser.preferences,
      source: 'mock' as const
    }
  }

  async getSetupSnapshot(currentUserId?: string) {
    if (this.useDatabase) {
      try {
        const totalResult = await db.query('SELECT COUNT(*) as count FROM users')
        const adminResult = await db.query('SELECT COUNT(*) as count FROM users WHERE is_admin = true')
        let setupCompletedAt: string | null = null
        if (currentUserId) {
          const userResult = await db.query('SELECT setup_completed_at FROM users WHERE id = $1', [currentUserId])
          setupCompletedAt = userResult.rows[0]?.setup_completed_at || null
        }

        const totalUsers = parseInt(totalResult.rows[0].count || '0', 10)
        const adminUsers = parseInt(adminResult.rows[0].count || '0', 10)

        return {
          totalUsers,
          hasAdminUser: adminUsers > 0,
          isNewInstall: totalUsers === 0,
          setupCompletedAt,
          source: 'database' as const
        }
      } catch (error) {
        if (!this.allowFallback) {
          throw error
        }
        logger.warn(LogCategory.AUTH, 'Failed to fetch setup snapshot from DB, falling back', {
          userId: currentUserId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const records = this.mockStore.list()
    const setupCompletedAt = currentUserId ? this.mockStore.findById(currentUserId)?.setup_completed_at || null : null

    return {
      totalUsers: records.length,
      hasAdminUser: records.some(record => record.is_admin),
      isNewInstall: records.length === 0,
      setupCompletedAt,
      source: 'mock' as const
    }
  }

  private async registerInDatabase(payload: RegisterPayload): Promise<NormalizedUser> {
    try {
      const normalizedEmail = payload.email.trim().toLowerCase()
      const creation = await userCreationService.createUser({
        email: normalizedEmail,
        password: payload.password,
        authMode: payload.authMode,
        username: payload.username,
        name: payload.name,
        displayName: payload.name,
        sendWelcomeEmail: false,
        requireEmailVerification: false,
        metadata: { source: 'self-register' }
      })

      return this.normalizeDbUser(creation.user)
    } catch (error: any) {
      if (error instanceof UserAccountError) {
        throw error
      }

      // Handle specific EmailExistsError from userCreationService
      if (error instanceof EmailExistsError) {
        throw new UserAccountError('User with this email already exists', 409)
      }

      if (this.isTransientDatabaseError(error)) {
        throw error
      }

      const message = typeof error?.message === 'string' ? error.message : 'Failed to create user'

      // Handle PostgreSQL unique constraint violations
      if (error?.code === '23505') {
        const constraint = (error?.constraint || '').toLowerCase()
        if (constraint.includes('email')) {
          throw new UserAccountError('User with this email already exists', 409)
        }
        if (constraint.includes('username')) {
          throw new UserAccountError('Username already exists', 409)
        }
      }

      throw new UserAccountError(message, 400)
    }
  }

  private trackRegistrationMetric(
    source: 'database' | 'mock' | 'mock-fallback',
    authMode: 'password' | 'passwordless',
    result: 'success' | 'failure'
  ) {
    try {
      recordAuthRegistration(source, authMode, result)
    } catch (error) {
      logger.warn(LogCategory.METRICS, 'Failed to record auth registration metric', {
        source,
        authMode,
        result,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private shouldFallbackToMock(error: unknown): boolean {
    return this.allowFallback && this.isTransientDatabaseError(error)
  }

  private isTransientDatabaseError(error: any): boolean {
    if (!error) {
      return false
    }

    const codes = new Set([
      '57P01', // admin_shutdown
      '57P02', // crash_shutdown
      '57P03', // cannot_connect_now
      '53300', // too_many_connections
      '55006', // object_in_use
      '08000', // connection_exception
      '08001', // sqlclient_unable_to_establish_sqlconnection
      '08003', // connection_does_not_exist
      '08004', // sqlserver_rejected_establishment_of_sqlconnection
      '08006', // connection_failure
      '08007', // transaction_resolution_unknown
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'ETIMEDOUT',
      'ENOTFOUND'
    ])

    const errorCode = (error?.code || error?.original?.code || '').toString().toUpperCase()
    if (errorCode && codes.has(errorCode)) {
      return true
    }

    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
    if (!message) {
      return false
    }

    const transientPatterns = [
      'connection terminated',
      'could not connect to server',
      'server closed the connection unexpectedly',
      'the database system is shutting down',
      'timeout expired',
      'remaining connection slots are reserved',
      'pool is draining and cannot accept work',
      'pool is closed',
      'connection timeout'
    ]

    return transientPatterns.some(pattern => message.includes(pattern))
  }

  private async findDatabaseAccount(identifier: { email?: string; username?: string }) {
    if (!identifier.email && !identifier.username) {
      return null
    }

    const result = await db.query(
      `SELECT id, email, username, display_name, password_hash, roles, permissions, is_admin, is_active,
              created_at, updated_at, last_login_at, setup_completed_at, avatar_url, preferences,
              auth_mode, email_verified
       FROM users
       WHERE email = $1 OR username = $2`,
      [identifier.email || '', identifier.username || '']
    )

    if (result.rows.length === 0) {
      return null
    }

    return { row: result.rows[0] }
  }

  private async ensurePasswordRequirements(account: { row: any }, password?: string) {
    // For passwordless accounts, no password validation needed
    if (account.row.auth_mode === 'passwordless') {
      return // No password required for passwordless accounts
    }

    // For password-based accounts, validate password
    if (account.row.auth_mode === 'password') {
      if (!password || password === '') {
        throw new UserAccountError('Password is required for this account', 401)
      }
      const valid = await bcrypt.compare(password, account.row.password_hash || '')
      if (!valid) {
        throw new UserAccountError('Invalid credentials', 401)
      }
    }
  }

  private normalizeDbUser(row: any): NormalizedUser {
    // Safely parse preferences with error handling
    let preferences: Record<string, any> = {};
    if (row.preferences) {
      if (typeof row.preferences === 'string') {
        try {
          preferences = JSON.parse(row.preferences);
        } catch (parseError) {
          logger.warn(LogCategory.AUTH, 'Failed to parse user preferences JSON', {
            userId: row.id,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
          preferences = {};
        }
      } else if (typeof row.preferences === 'object') {
        preferences = row.preferences;
      }
    }

    return {
      id: row.id,
      email: row.email,
      name: row.display_name || row.username || row.email?.split('@')[0] || 'User',
      username: row.username || row.email?.split('@')[0] || `user_${row.id?.slice(0, 8)}`,
      avatar: row.avatar_url || null,
      roles: this.toRoleObjects(Array.isArray(row.roles) ? row.roles : []),
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLogin: row.last_login_at,
      isAdmin: Boolean(row.is_admin),
      isActive: row.is_active ?? true,
      setupCompletedAt: row.setup_completed_at,
      preferences,
      authMode: row.auth_mode === 'passwordless' ? 'passwordless' : 'password',
      emailVerified: Boolean(row.email_verified)
    }
  }

  private normalizeMockUser(record: MockUserRecord): NormalizedUser {
    return {
      id: record.id,
      email: record.email,
      name: record.display_name,
      username: record.username,
      avatar: record.avatar_url,
      roles: this.toRoleObjects(record.roles),
      permissions: record.permissions,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      lastLogin: record.last_login_at,
      isAdmin: record.is_admin,
      isActive: record.is_active,
      setupCompletedAt: record.setup_completed_at,
      preferences: record.preferences || {},
      authMode: record.auth_mode,
      emailVerified: record.email_verified ?? (record.auth_mode === 'password')
    }
  }

  private toRoleObjects(roles: string[]): Array<{ id: string; name: string; permissions: string[] }> {
    return roles.map(role => ({ id: role, name: role, permissions: [] }))
  }

  private ensureMockAdminAccount() {
    if (process.env.NODE_ENV !== 'development') {
      return
    }
    const email = (process.env.DEV_ADMIN_EMAIL || 'admin@maifarm.local').toLowerCase()
    const password = process.env.DEV_ADMIN_PASSWORD || 'maifarm123'
    const existing = this.mockStore.findByEmailOrUsername({ email })
    if (existing) {
      return
    }

    try {
      const record = this.mockStore.register({
        email,
        name: 'MaiFarm Admin',
        password,
        authMode: 'password',
        username: 'maifarm_admin'
      })
      logger.info(LogCategory.AUTH, 'Provisioned default development admin user', {
        email: record.email
      })
    } catch (error) {
      logger.warn(LogCategory.AUTH, 'Failed to provision default development admin user', {
        email,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

export const userAccountService = new UserAccountService()
