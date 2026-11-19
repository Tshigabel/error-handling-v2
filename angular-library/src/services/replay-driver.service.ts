import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { ReplayStateService } from './replay-state.service';
import {
  ClickEvent,
  NavigationEvent,
  TimelineEvent,
} from '../models/timeline-event.model';

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'finished';

@Injectable()
export class ReplayDriverService {
  status$ = new BehaviorSubject<ReplayStatus>('idle');
  currentEvent$ = new BehaviorSubject<TimelineEvent | null>(null);
  log$ = new Subject<string>();

  private index = 0;
  private speed = 1;
  private timeoutId: any = null;

  constructor(
    private replayState: ReplayStateService,
    private router: Router,
    private ngZone: NgZone
  ) {}

  setSpeed(factor: number): void {
    this.speed = factor;
  }

  play(): void {
    if (!this.replayState.isActive()) return;

    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      return;
    }

    this.status$.next('playing');
    this.processNext();
  }

  pause(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.status$.next('paused');
  }

  step(): void {
    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      return;
    }
    this.executeEvent(timeline[this.index]);
  }

  reset(): void {
    this.pause();
    this.index = 0;
    this.currentEvent$.next(null);
    this.status$.next('idle');
  }

  private processNext(): void {
    const timeline = this.replayState.getTimeline();

    if (this.index >= timeline.length) {
      this.status$.next('finished');
      this.log$.next('Replay finished.');
      return;
    }

    if (this.status$.value !== 'playing') return;

    const event = timeline[this.index];
    this.executeEvent(event);
  }

  private executeEvent(event: TimelineEvent): void {
    this.currentEvent$.next(event);
    this.replayState.currentEventIndex$.next(this.index);
    this.log$.next(`[${event.seq}] ${event.type}: ${this.describeEvent(event)}`);

    switch (event.type) {
      case 'navigation':
        this.handleNavigation(event.payload as NavigationEvent);
        break;
      case 'click':
        this.handleClick(event.payload as ClickEvent);
        break;
      case 'http':
        this.handleHttp(event);
        break;
      case 'error':
        this.log$.next('ERROR EVENT — this is where production failed.');
        this.pause();
        this.index++;
        return;
    }

    this.index++;
    this.scheduleNext(event);
  }

  private handleNavigation(nav: NavigationEvent): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(nav.to);
    });
  }

  private handleClick(click: ClickEvent): void {
    this.waitForElement(click.selector, 5000).then((el) => {
      if (!el) {
        this.log$.next(`WARNING: element not found: ${click.selector}`);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.highlightElement(el);
      this.ngZone.run(() => {
        (el as HTMLElement).click();
      });
    });
  }

  private handleHttp(_event: TimelineEvent): void {
    // HTTP events are consumed passively by ReplayHttpInterceptor
  }

  private scheduleNext(currentEvent: TimelineEvent): void {
    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      return;
    }

    const nextEvent = timeline[this.index];
    const currentTs = new Date(currentEvent.timestamp).getTime();
    const nextTs = new Date(nextEvent.timestamp).getTime();
    const delay = Math.max(0, (nextTs - currentTs) / this.speed);

    this.timeoutId = setTimeout(() => this.processNext(), delay);
  }

  private waitForElement(
    selector: string,
    timeoutMs: number
  ): Promise<Element | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  private highlightElement(el: Element): void {
    const htmlEl = el as HTMLElement;
    const original = htmlEl.style.outline;
    htmlEl.style.outline = '3px solid #3182ce';
    setTimeout(() => (htmlEl.style.outline = original), 1500);
  }

  private describeEvent(event: TimelineEvent): string {
    switch (event.type) {
      case 'http':
        return `${(event.payload as any).method} ${(event.payload as any).url}`;
      case 'click':
        return `${(event.payload as any).elementTag} "${(event.payload as any).elementText || ''}"`;
      case 'navigation':
        return `${(event.payload as any).from} → ${(event.payload as any).to}`;
      case 'error':
        return (event.payload as any).message;
      default:
        return '';
    }
  }
}
