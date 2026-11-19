import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TimelineBufferService } from '../services/timeline-buffer.service';
import { ErrorNotificationService } from '../services/error-notification.service';
import { ErrorEvent } from '../models/timeline-event.model';

@Injectable()
export class TimelineErrorHandler implements ErrorHandler {
  // Use Injector to avoid circular dependency with HttpClient
  constructor(private injector: Injector) {}

  handleError(error: any): void {
    const buffer = this.injector.get(TimelineBufferService);
    const notification = this.injector.get(ErrorNotificationService);

    const errorEvent: ErrorEvent = this.toErrorEvent(error);
    buffer.append({ type: 'error', payload: errorEvent });
    notification.notify(errorEvent);

    console.error('TimelineErrorHandler caught:', error);
  }

  private toErrorEvent(error: any): ErrorEvent {
    if (error instanceof HttpErrorResponse) {
      return {
        message: `HTTP ${error.status}: ${error.message}`,
        source: 'http',
      };
    }

    const unwrapped = error.rejection || error;
    return {
      message: unwrapped.message || String(unwrapped),
      stack: unwrapped.stack,
      source: 'runtime',
    };
  }
}
