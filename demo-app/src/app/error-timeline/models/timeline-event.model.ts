export interface TimelineEvent {
  id: string;
  seq: number;
  timestamp: string;
  type: 'http' | 'click' | 'navigation' | 'error';
  payload: HttpEvent | ClickEvent | NavigationEvent | ErrorEvent;
}

export interface HttpEvent {
  correlationId: string;
  phase: 'request' | 'response';
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  durationMs?: number;
  error?: { message: string; name: string };
  truncated?: boolean;
}

export interface ClickEvent {
  selector: string;
  elementTag: string;
  elementText?: string;
  dataTestId?: string;
  routeUrl: string;
}

export interface NavigationEvent {
  from: string;
  to: string;
}

export interface ErrorEvent {
  message: string;
  stack?: string;
  source: 'http' | 'runtime';
}

export interface ErrorReport {
  reportId: string;
  createdAt: string;
  app: { name: string; version: string; environment: string };
  session: {
    sessionId: string;
    userId?: string;
    userAgent: string;
    viewport: { w: number; h: number };
  };
  triggeringError: ErrorEvent;
  initialRoute: string;
  timeline: TimelineEvent[];
  userComment?: string;
}
