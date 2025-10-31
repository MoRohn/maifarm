declare global {
  interface Window {
    __backendWarningShown?: boolean;
    __lastRateLimitError?: {
      provider: string;
      providerName: string;
      providerUrl: string;
      message: string;
      timestamp: number;
    };
    __APP_START_TIME__?: number;
  }
}

export {};