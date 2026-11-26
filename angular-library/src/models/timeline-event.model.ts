export interface TimelineEvent {
  id: string;
  seq: number;
  timestamp: string;
  type: 'http' | 'click' | 'navigation' | 'error' | 'input';
  payload: HttpEvent | ClickEvent | NavigationEvent | ErrorEvent | InputChangeEvent;
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
  elementId?: string;
  ariaLabel?: string;
  role?: string;
  name?: string;
  formControlName?: string;
  classes?: string[];
  routeUrl: string;
}

export interface NavigationEvent {
  from: string;
  to: string;
}

export interface InputChangeEvent {
  selector: string;
  elementTag: string;
  inputType: string;
  value: string | boolean;
  elementId?: string;
  dataTestId?: string;
  ariaLabel?: string;
  name?: string;
  formControlName?: string;
  placeholder?: string;
  label?: string;
  classes?: string[];
  routeUrl: string;
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
