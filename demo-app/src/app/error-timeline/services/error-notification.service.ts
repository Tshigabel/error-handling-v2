import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ErrorEvent } from '../models/timeline-event.model';

@Injectable()
export class ErrorNotificationService {
  private errorSubject = new Subject<ErrorEvent>();
  private lastNotification = 0;
  private readonly debounceMs = 3000;

  error$ = this.errorSubject.asObservable();

  notify(error: ErrorEvent): void {
    const now = Date.now();
    if (now - this.lastNotification < this.debounceMs) return;
    this.lastNotification = now;
    this.errorSubject.next(error);
  }
}
