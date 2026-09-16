// @ts-nocheck
// Test Setup Configuration
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { mockServices } from './__mocks__/services';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BYPASS_AUTH = 'true';

// Mock import.meta.env for Vite compatibility in Jest
// This is needed because Jest runs in CommonJS mode but Vite uses ES modules
const importMetaEnv = {
  VITE_API_URL: 'http://localhost:4567',
  VITE_WS_URL: 'ws://localhost:4567',
  VITE_APP_TITLE: 'MaiFarm',
  MODE: 'test',
  DEV: false,
  PROD: false,
  SSR: false,
  BASE_URL: '/',
};

// @ts-ignore - We need to define import.meta for Jest environment
globalThis.import = { meta: { env: importMetaEnv } };

// Also define on global for broader compatibility
(global as any).import = { meta: { env: importMetaEnv } };

// Mock Redis client (standardize across all tests)
const createRedisMock = (): any => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(1),
  mGet: jest.fn().mockResolvedValue([]),
  mSet: jest.fn().mockResolvedValue('OK'),
  keys: jest.fn().mockResolvedValue([]),
  flushDb: jest.fn().mockResolvedValue('OK'),
  flushAll: jest.fn().mockResolvedValue('OK'),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  hGet: jest.fn().mockResolvedValue(null),
  hSet: jest.fn().mockResolvedValue(1),
  hDel: jest.fn().mockResolvedValue(1),
  hGetAll: jest.fn().mockResolvedValue({}),
  // ioredis-style lowercase aliases for compatibility
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  sAdd: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  sRem: jest.fn().mockResolvedValue(1),
  zAdd: jest.fn().mockResolvedValue(1),
  zRange: jest.fn().mockResolvedValue([]),
  zRem: jest.fn().mockResolvedValue(1),
  publish: jest.fn().mockResolvedValue(1),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  duplicate: jest.fn().mockImplementation(() => {
    // Return a simple mock without circular dependency
    const simpleMock: any = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setEx: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
      off: jest.fn(),
      isOpen: true,
      isReady: true,
    };
    return simpleMock;
  }),
  pipeline: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([['OK'], ['value'], [1]])
  }),
  multi: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([['OK'], ['value'], [1]])
  }),
  isOpen: true,
  isReady: true,
});

// Mock the 'redis' package (what the codebase uses)
jest.mock('redis', () => ({
  createClient: jest.fn().mockImplementation(() => createRedisMock()),
  commandOptions: jest.fn((options) => options),
}));

// Mock the 'ioredis' package (for legacy tests that still expect it)
jest.mock('ioredis', () => {
  const mockRedis = createRedisMock();
  const Redis = jest.fn().mockImplementation(() => mockRedis);
  // Add static methods
  Redis.Command = { setArgumentTransformer: jest.fn() };
  Redis.Cluster = jest.fn();
  return { default: Redis, Redis };
});

// Mock database connection module
jest.mock('../apps/api/src/database/connection', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined),
  },
  redis: createRedisMock(),
  connectDatabase: jest.fn().mockResolvedValue(undefined),
  disconnectDatabase: jest.fn().mockResolvedValue(undefined),
  checkDatabaseHealth: jest.fn().mockResolvedValue({ healthy: true, message: 'OK' }),
}));

// Ensure "window" exists when running in a Node-based test environment
const globalAny = globalThis as any;
if (typeof window === 'undefined') {
  globalAny.window = globalAny;
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.IntersectionObserver = mockIntersectionObserver as unknown as typeof globalThis.IntersectionObserver;

// Mock ResizeObserver
const mockResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.ResizeObserver = mockResizeObserver as unknown as typeof globalThis.ResizeObserver;

// Mock fetch
const mockFetchResponse: Partial<Response> = {
  ok: true,
  json: jest.fn().mockImplementation(() => Promise.resolve({})) as any,
  text: jest.fn().mockImplementation(() => Promise.resolve('')) as any,
  blob: jest.fn().mockImplementation(() => Promise.resolve(new Blob())) as any,
  headers: new Headers(),
  status: 200,
  statusText: 'OK',
};

const mockFetch = jest.fn().mockImplementation(() => Promise.resolve(mockFetchResponse as Response)) as any;

global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send(data: any) {
    // Mock send
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

global.WebSocket = MockWebSocket as any;

// Mock logger module
jest.mock('../apps/api/src/utils/logger', () => {
  const mockLogger = jest.requireActual<typeof import('./__mocks__/logger')>('./__mocks__/logger');
  return mockLogger;
});

// Mock service modules
jest.mock('@/services/websocket/websocketService', () => ({
  websocketService: mockServices.websocket,
}));

jest.mock('@/services/farmService', () => ({
  farmService: mockServices.farm,
}));

jest.mock('@/services/harvestService', () => ({
  harvestService: mockServices.harvest,
}));

jest.mock('@/services/barnService', () => ({
  barnService: mockServices.barn,
}));

jest.mock('@/services/auth', () => ({
  authService: mockServices.auth,
}));

jest.mock('@/services/analyticsService', () => ({
  analyticsService: mockServices.analytics,
}));

// Mock API client
jest.mock('@/services/apiClient', () => {
  const actual = jest.requireActual<typeof import('../apps/dashboard/src/services/apiClient')>('../apps/dashboard/src/services/apiClient');

  const createResolved = () => Promise.resolve({ data: {} });

  return {
    ...actual,
    default: {
      get: jest.fn(createResolved),
      post: jest.fn(createResolved),
      put: jest.fn(createResolved),
      delete: jest.fn(createResolved),
      patch: jest.fn(createResolved),
    },
  } as unknown as typeof actual;
});

// Mock router
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useLocation: () => ({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    }),
    useParams: () => ({}),
  } as typeof actual;
});

// Mock toast notifications
jest.mock('react-hot-toast', () => ({
  default: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    custom: jest.fn(),
    dismiss: jest.fn(),
    remove: jest.fn(),
  },
  Toaster: () => null,
}));

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
       args[0].includes('Warning: useLayoutEffect') ||
       args[0].includes('Not wrapped in act'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});

export { mockServices };
