// Mock implementation of apiClient for tests
const mockApiClient = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  patch: jest.fn().mockResolvedValue({ data: {} }),
  request: jest.fn().mockResolvedValue({ data: {} }),
  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn(),
    },
    response: {
      use: jest.fn(),
      eject: jest.fn(),
    },
  },
  defaults: {
    headers: {
      common: {},
      post: {},
      put: {},
      patch: {},
    },
  },
};

export default mockApiClient;

// Export helper functions to set up specific mock responses
export const mockApiResponse = (method: string, url: string, response: any) => {
  const methodFn = mockApiClient[method as keyof typeof mockApiClient];
  if (typeof methodFn === 'function') {
    methodFn.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.includes(url)) {
        return Promise.resolve({ data: response });
      }
      return Promise.resolve({ data: {} });
    });
  }
};

export const mockApiError = (method: string, url: string, error: any) => {
  const methodFn = mockApiClient[method as keyof typeof mockApiClient];
  if (typeof methodFn === 'function') {
    methodFn.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.includes(url)) {
        return Promise.reject(error);
      }
      return Promise.resolve({ data: {} });
    });
  }
};

export const resetApiMocks = () => {
  Object.keys(mockApiClient).forEach(key => {
    const value = mockApiClient[key as keyof typeof mockApiClient];
    if (typeof value === 'function' && 'mockClear' in value) {
      value.mockClear();
    }
  });
};