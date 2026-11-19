import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  ErrorReport,
  HttpEvent,
  TimelineEvent,
} from '../models/timeline-event.model';

@Injectable()
export class ReplayStateService {
  private report: ErrorReport | null = null;
  private consumedHttpIndices = new Set<number>();

  active$ = new BehaviorSubject<boolean>(false);
  currentEventIndex$ = new BehaviorSubject<number>(-1);

  load(report: ErrorReport): void {
    this.report = report;
    this.consumedHttpIndices.clear();
    this.currentEventIndex$.next(-1);
    this.active$.next(true);
  }

  stop(): void {
    this.report = null;
    this.consumedHttpIndices.clear();
    this.active$.next(false);
    this.currentEventIndex$.next(-1);
  }

  isActive(): boolean {
    return this.active$.value;
  }

  getReport(): ErrorReport | null {
    return this.report;
  }

  getTimeline(): TimelineEvent[] {
    return this.report ? this.report.timeline : [];
  }

  findMatchingHttpResponse(
    method: string,
    url: string
  ): { event: HttpEvent; index: number } | null {
    if (!this.report) return null;

    const timeline = this.report.timeline;
    for (let i = 0; i < timeline.length; i++) {
      if (this.consumedHttpIndices.has(i)) continue;
      if (timeline[i].type !== 'http') continue;

      const payload = timeline[i].payload as HttpEvent;
      if (payload.phase !== 'response') continue;
      if (payload.method !== method) continue;

      if (this.urlsMatch(payload.url, url)) {
        this.consumedHttpIndices.add(i);
        return { event: payload, index: i };
      }
    }
    return null;
  }

  private urlsMatch(recorded: string, actual: string): boolean {
    const normalize = (u: string) => {
      try {
        const parsed = new URL(u, 'http://localhost');
        return parsed.pathname + parsed.search;
      } catch {
        return u;
      }
    };
    return normalize(recorded) === normalize(actual);
  }
}
