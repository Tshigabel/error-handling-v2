import { InjectionToken } from '@angular/core';

export interface ErrorTimelineConfig {
  reportEndpoint: string;
  retention: {
    maxAgeMs: number;
    minEvents: number;
  };
  ignoreUrls: RegExp[];
  redactHeaders: string[];
  redactBodyKeys: string[];
  maxBodyBytes: number;
  app: {
    name: string;
    version: string;
    environment: string;
  };
  replay: {
    enabled: boolean;
  };
}

export const DEFAULT_CONFIG: ErrorTimelineConfig = {
  reportEndpoint: '/api/error-reports',
  retention: { maxAgeMs: 120_000, minEvents: 10 },
  ignoreUrls: [],
  redactHeaders: ['authorization', 'cookie', 'set-cookie'],
  redactBodyKeys: ['password', 'token', 'secret', 'ssn', 'cardNumber'],
  maxBodyBytes: 65_536,
  app: { name: '', version: '', environment: '' },
  replay: { enabled: false },
};

export const ERROR_TIMELINE_CONFIG = new InjectionToken<ErrorTimelineConfig>(
  'ERROR_TIMELINE_CONFIG'
);
