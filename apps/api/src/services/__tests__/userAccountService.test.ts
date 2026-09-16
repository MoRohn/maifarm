/**
 * @jest-environment node
 */

import * as userAccountModule from '../userAccountService'
import { userCreationService } from '../userCreationService'

const { UserAccountError } = userAccountModule

jest.mock('path', () => {
  const actual = jest.requireActual<typeof import('path')>('path')
  const resolveMock = jest.fn(() => '/tmp/mock-users.json')

  return {
    __esModule: true,
    ...actual,
    resolve: resolveMock,
    default: {
      ...actual,
      resolve: resolveMock
    }
  }
})

jest.mock('../userCreationService', () => {
  // Define EmailExistsError inside the factory to avoid hoisting issues
  class EmailExistsError extends Error {
    constructor(message: string = 'Email already exists') {
      super(message);
      this.name = 'EmailExistsError';
    }
  }

  return {
    userCreationService: {
      createUser: jest.fn()
    },
    EmailExistsError
  };
})

const createUserMock = userCreationService.createUser as jest.Mock

const resolveServiceConstructor = () => {
  const ctor = (userAccountModule as any).UserAccountService
    || (userAccountModule as any).userAccountService?.constructor

  if (!ctor) {
    throw new Error('UserAccountService constructor unavailable for testing')
  }

  return ctor
}

const buildMockStore = () => {
  const register = jest.fn((payload: any) => {
    const timestamp = new Date().toISOString()
    return {
      id: 'mock-user-id',
      email: payload.email,
      username: payload.username || payload.email.split('@')[0],
      display_name: payload.name || payload.email,
      password_hash: null,
      auth_mode: payload.authMode,
      roles: ['admin'],
      permissions: [],
      is_admin: true,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
      last_login_at: null,
      setup_completed_at: null,
      avatar_url: null,
      preferences: {}
    }
  })

  return {
    register,
    findByEmailOrUsername: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    list: jest.fn(() => [])
  }
}

const buildService = () => {
  const ServiceCtor = resolveServiceConstructor()
  const service = new ServiceCtor()
  const internal = service as any
  internal.useDatabase = true
  internal.allowFallback = true
  internal.mockStore = buildMockStore()
  return { service, mockStore: internal.mockStore }
}

describe('UserAccountService.register', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('does not fallback when registration fails due to duplicate email', async () => {
    const { service, mockStore } = buildService()
    createUserMock.mockRejectedValue(new Error('Email already exists'))

    await expect(
      service.register({
        email: 'admin@example.com',
        name: 'Admin',
        password: 'Password123!',
        authMode: 'password'
      })
    ).rejects.toBeInstanceOf(UserAccountError)

    expect(mockStore.register).not.toHaveBeenCalled()
  })

  it('falls back to mock store when database connection is unavailable', async () => {
    const { service, mockStore } = buildService()
    const connectionError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    createUserMock.mockRejectedValue(connectionError)

    const result = await service.register({
      email: 'admin@example.com',
      name: 'Admin',
      password: 'Password123!',
      authMode: 'password'
    })

    expect(result.source).toBe('mock')
    expect(mockStore.register).toHaveBeenCalledTimes(1)
    expect(result.user.email).toBe('admin@example.com')
  })
})
