import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TimelineBufferService } from './timeline-buffer.service';
import {
  ErrorEvent,
  ErrorReport,
  TimelineEvent,
} from '../models/timeline-event.model';
import {
  ERROR_TIMELINE_CONFIG,
  ErrorTimelineConfig,
} from '../models/error-timeline-config';

@Injectable()
export class ErrorReportService {
  private sessionId = this.uuid();

  constructor(
    private http: HttpClient,
    private buffer: TimelineBufferService,
    @Inject(ERROR_TIMELINE_CONFIG) private config: ErrorTimelineConfig
  ) {}

  buildReport(
    triggeringError: ErrorEvent,
    userComment?: string
  ): ErrorReport {
    const timeline = this.buffer.snapshot();
    const initialRoute = this.findInitialRoute(timeline);

    return {
      reportId: this.uuid(),
      createdAt: new Date().toISOString(),
      app: { ...this.config.app },
      session: {
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        viewport: {
          w: window.innerWidth,
          h: window.innerHeight,
        },
      },
      triggeringError,
      initialRoute,
      timeline,
      userComment: userComment || undefined,
    };
  }

  submitReport(
    report: ErrorReport
  ): Observable<{ reportId: string; storedAt: string }> {
    return this.http
      .post<{ reportId: string; storedAt: string }>(
        this.config.reportEndpoint,
        report
      )
      .pipe(map((response) => response));
  }

  fetchReport(reportId: string): Observable<ErrorReport> {
    return this.http.get<ErrorReport>(
      `${this.config.reportEndpoint}/${reportId}`
    );
  }

  private findInitialRoute(timeline: TimelineEvent[]): string {
    for (const event of timeline) {
      if (event.type === 'navigation') {
        return (event.payload as any).from;
      }
      if (event.type === 'click') {
        return (event.payload as any).routeUrl;
      }
    }
    return window.location.pathname;
  }

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
