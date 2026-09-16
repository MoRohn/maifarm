jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(async (value) => `hashed:${value}`),
    compare: jest.fn(async (value, hash) => hash === `hashed:${value}`)
  }
}));

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn(() => 'mock-token'),
    verify: jest.fn(() => ({ userId: 'mock-user', email: 'mock@example.com', roles: ['user'] }))
  }
}));

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs').default;

const authModule = require('../../api/auth');
const authRouter = authModule.default || authModule;
const { db } = require('../../database/connection');
const { userManagementService } = require('../../services/userManagementService');

const mockedDb = db;
const users = [];

const findRouteHandlers = (method, path) => {
  const lowerMethod = method.toLowerCase();
  for (const layer of authRouter.stack) {
    if (!layer.route) continue;
    if (layer.route.path === path) {
      return layer.route.stack
        .filter(routeLayer => !routeLayer.method || routeLayer.method === lowerMethod)
        .map(routeLayer => routeLayer.handle);
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found on auth router`);
};

const createMockRequest = (method, path, { body = {}, headers = {}, ip = '127.0.0.1' } = {}) => {
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const req = {
    method: method.toUpperCase(),
    path,
    originalUrl: path,
    body,
    headers: normalizedHeaders,
    query: {},
    params: {},
    ip,
    get: (name) => normalizedHeaders[name.toLowerCase()],
  };

  return req;
};

const createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: false,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.set = (field, value) => {
    res.headers[String(field).toLowerCase()] = value;
    return res;
  };

  res.json = (payload) => {
    res.sent = true;
    res.body = payload;
    return res;
  };

  res.send = (payload) => {
    res.sent = true;
    res.body = payload;
    return res;
  };

  return res;
};

const executeHandlers = async (handlers, req, res, index = 0) => {
  if (index >= handlers.length) {
    return;
  }

  const handler = handlers[index];

  if (handler.length >= 3) {
    await new Promise((resolve, reject) => {
      let finished = false;

      const next = (err) => {
        if (finished) {
          return;
        }
        finished = true;
        if (err) {
          reject(err);
        } else {
          executeHandlers(handlers, req, res, index + 1).then(resolve).catch(reject);
        }
      };

      try {
        const result = handler(req, res, next);

        if (result && typeof result.then === 'function') {
          result
            .then(() => {
              if (!finished) {
                finished = true;
                executeHandlers(handlers, req, res, index + 1).then(resolve).catch(reject);
              }
            })
            .catch(reject);
        } else if (res.sent && !finished) {
          finished = true;
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  } else {
    try {
      await handler(req, res);
      await executeHandlers(handlers, req, res, index + 1);
    } catch (error) {
      throw error;
    }
  }
};

const invokeRoute = async (method, path, options = {}) => {
  const handlers = findRouteHandlers(method, path);
  const req = createMockRequest(method, path, options);
  const res = createMockResponse();
  await executeHandlers(handlers, req, res);
  return res;
};

const invokeRegister = (payload) => invokeRoute('post', '/register', { body: payload });

const resetDbMock = () => {
  mockedDb.query.mockReset();
  mockedDb.query.mockImplementation(function () {
    const sql = arguments[0];
    const params = (arguments.length > 1 && Array.isArray(arguments[1])) ? arguments[1] : [];
    const text = typeof sql === 'string' ? sql : (sql && sql.text) || '';
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith("insert into users ( email, username, display_name")) {
      const email = (params[0] || '').toLowerCase();
      const username = params[1];
      const displayName = params[2];
      const passwordHash = params[3] || null;
      const roles = params[4] || [];
      const permissions = params[5] || [];
      const isAdmin = Boolean(params[6]);
      const preferences = params[7] || {};
      const authMode = params[8];
      const emailVerified = Boolean(params[9]);
      const now = new Date();

      const stored = {
        id: uuidv4(),
        email,
        username,
        display_name: displayName,
        password_hash: passwordHash,
        roles,
        permissions,
        is_admin: isAdmin,
        preferences: typeof preferences === 'string' ? JSON.parse(preferences) : preferences,
        auth_mode: authMode,
        email_verified: emailVerified,
        is_active: true,
        mfa_enabled: false,
        created_at: now,
        updated_at: now,
        last_login_at: null,
        setup_completed_at: params[10] || null
      };

      users.push(stored);
      return { rows: [stored] };
    }

    if (normalized.startsWith("insert into users ( id, email, username")) {
      const id = params[0];
      const email = (params[1] || '').toLowerCase();
      const username = params[2];
      const passwordHash = params[3] || null;
      const roles = params[4] || [];
      const permissions = params[5] || [];
      const displayName = params[6];
      const avatarUrl = params[7] || null;
      const preferences = params[8] || {};
      const isActive = Boolean(params[9]);
      const authMode = params[10];
      const emailVerified = Boolean(params[11]);
      const isAdmin = Boolean(params[12]);
      const now = new Date();

      const stored = {
        id,
        email,
        username,
        display_name: displayName,
        password_hash: passwordHash,
        roles,
        permissions,
        is_admin: isAdmin,
        preferences: typeof preferences === 'string' ? JSON.parse(preferences) : preferences,
        auth_mode: authMode,
        email_verified: emailVerified,
        is_active: isActive,
        mfa_enabled: false,
        created_at: now,
        updated_at: now,
        last_login_at: null,
        avatar_url: avatarUrl,
        setup_completed_at: params[13] || null
      };

      users.push(stored);
      return { rows: [stored] };
    }

    throw new Error(`Unhandled query in registration test mock: ${normalized}`);
  });
};

describe('User Registration API', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.REFRESH_SECRET = 'test-refresh-secret';
    process.env.ENABLE_RATE_LIMIT = 'false';
  });

  beforeEach(() => {
    users.length = 0;
    resetDbMock();

    jest.spyOn(userManagementService, 'getUserByEmail').mockImplementation(async (email) => {
      const user = users.find(u => u.email === email.toLowerCase());
      return user ? { ...user } : null;
    });

    jest.spyOn(userManagementService, 'getUserByUsername').mockImplementation(async (username) => {
      const user = users.find(u => u.username === username);
      return user ? { ...user } : null;
    });

    jest.spyOn(userManagementService, 'isFirstUser').mockImplementation(async () => {
      return users.filter(user => user.is_active !== false).length === 0;
    });
  });

  afterEach(() => {
    mockedDb.query.mockReset();
    jest.restoreAllMocks();
  });

  it('registers the first user with password authentication and admin privileges', async () => {
    const response = await invokeRegister({
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'Password123!',
      authMode: 'password'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();

    const user = response.body.user;
    expect(user.email).toBe('admin@example.com');
    expect(user.isAdmin).toBe(true);
    expect(user.authMode).toBe('password');
    expect(user.roles.map(role => role.name)).toContain('admin');

    expect(users).toHaveLength(1);
    const stored = users[0];
    expect(stored.is_admin).toBe(true);
    expect(stored.auth_mode).toBe('password');
    expect(stored.password_hash).not.toBeNull();
    expect(await bcrypt.compare('Password123!', stored.password_hash)).toBe(true);
  });

  it('supports passwordless registration without storing password hashes', async () => {
    await invokeRegister({
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'Password123!',
      authMode: 'password'
    });

    const response = await invokeRegister({
      email: 'passwordless@example.com',
      name: 'Passwordless User',
      authMode: 'passwordless'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    const user = response.body.user;
    expect(user.email).toBe('passwordless@example.com');
    expect(user.isAdmin).toBe(false);
    expect(user.authMode).toBe('passwordless');

    const stored = users.find(u => u.email === 'passwordless@example.com');
    expect(stored).toBeDefined();
    expect(stored.password_hash).toBeNull();
    expect(stored.auth_mode).toBe('passwordless');
  });

  it('handles duplicate email conflicts and auto-adjusts username collisions', async () => {
    const first = await invokeRegister({
      email: 'user1@example.com',
      name: 'Test User',
      password: 'Password123!',
      authMode: 'password'
    });

    const duplicateEmail = await invokeRegister({
      email: 'user1@example.com',
      name: 'Another User',
      password: 'AnotherPass123!',
      authMode: 'password'
    });

    expect(duplicateEmail.statusCode).toBe(409);
    expect(duplicateEmail.body.success).toBe(false);
    expect(duplicateEmail.body.error).toContain('email');

    const second = await invokeRegister({
      email: 'user2@example.com',
      name: 'Test User',
      password: 'Password123!',
      authMode: 'password'
    });

    expect(second.statusCode).toBe(201);

    const firstUsername = first.body.user.username;
    const secondUsername = second.body.user.username;

    expect(secondUsername).not.toBe(firstUsername);
    expect(secondUsername.startsWith(firstUsername)).toBe(true);
    expect(secondUsername.length).toBeGreaterThan(firstUsername.length);
  });

  it('returns validation errors for invalid registration payloads', async () => {
    const response = await invokeRegister({
      email: 'invalid-email',
      name: 'A',
      authMode: 'password'
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details.fieldErrors.email).toBeDefined();
    expect(response.body.details.fieldErrors.name).toBeDefined();

    const missingPassword = await invokeRegister({
      email: 'nopass@example.com',
      name: 'No Password',
      authMode: 'password'
    });

    expect(missingPassword.statusCode).toBe(400);
    expect(missingPassword.body.success).toBe(false);
    expect(missingPassword.body.error).toBe('Password is required when authMode is password');
  });

  it('assigns admin role only to the first registered user', async () => {
    const first = await invokeRegister({
      email: 'first@example.com',
      name: 'First User',
      password: 'Password123!',
      authMode: 'password'
    });

    const second = await invokeRegister({
      email: 'second@example.com',
      name: 'Second User',
      password: 'Password123!',
      authMode: 'password'
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.body.user.isAdmin).toBe(true);
    expect(second.body.user.isAdmin).toBe(false);
    expect(second.body.user.roles.map(role => role.name)).not.toContain('admin');
  });
});
