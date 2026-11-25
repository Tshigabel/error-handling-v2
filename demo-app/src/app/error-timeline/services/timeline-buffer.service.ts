import { Inject, Injectable } from '@angular/core';
import {
  NavigationEvent,
  TimelineEvent,
} from '../models/timeline-event.model';
import {
  ERROR_TIMELINE_CONFIG,
  ErrorTimelineConfig,
} from '../models/error-timeline-config';

@Injectable()
export class TimelineBufferService {
  private buffer: TimelineEvent[] = [];
  private seq = 0;
  private _recording = false;

  get recording(): boolean {
    return this._recording;
  }

  constructor(
    @Inject(ERROR_TIMELINE_CONFIG) private config: ErrorTimelineConfig
  ) {}

  startRecording(): void {
    this._recording = true;
  }

  stopRecording(): void {
    this._recording = false;
  }

  resetRecording(): void {
    this.buffer = [];
    this.seq = 0;
    this._recording = true;
  }

  append(
    event: Omit<TimelineEvent, 'id' | 'seq' | 'timestamp'>
  ): TimelineEvent | null {
    if (!this._recording) return null;

    const entry: TimelineEvent = {
      ...event,
      id: this.uuid(),
      seq: this.seq++,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(entry);
    this.prune();
    this.trimBySize();
    return entry;
  }

  snapshot(): TimelineEvent[] {
    this.prune();
    this.trimBySize();
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  private prune(): void {
    const { maxAgeMs, minEvents } = this.config.retention;
    const cutoff = Date.now() - maxAgeMs;

    if (this.buffer.length <= minEvents) {
      return;
    }

    const firstKeepByTime = this.buffer.findIndex(
      (e) => new Date(e.timestamp).getTime() >= cutoff
    );

    if (firstKeepByTime === -1) {
      this.buffer = this.buffer.slice(-minEvents);
      return;
    }

    const removeCount = Math.min(
      firstKeepByTime,
      this.buffer.length - minEvents
    );

    if (removeCount > 0) {
      this.buffer = this.buffer.slice(removeCount);
    }
  }

  private trimBySize(): void {
    const threshold = this.config.recording.trimThresholdBytes;
    if (!threshold || this.buffer.length === 0) return;

    const currentSize = this.estimateBufferSize();
    if (currentSize <= threshold) return;

    const journeyRoutes = this.config.recording.startRoutes;
    let trimIndex = -1;

    for (let i = 1; i < this.buffer.length; i++) {
      const event = this.buffer[i];
      if (event.type === 'navigation') {
        const nav = event.payload as NavigationEvent;
        if (this.isJourneyRoute(nav.to, journeyRoutes)) {
          trimIndex = i;
        }
      }
    }

    if (trimIndex > 0) {
      this.buffer = this.buffer.slice(trimIndex);
      return;
    }

    while (this.buffer.length > 1 && this.estimateBufferSize() > threshold) {
      this.buffer.shift();
    }
  }

  private isJourneyRoute(url: string, routes: string[]): boolean {
    const path = url.split('?')[0];
    return routes.some((route) => path.endsWith(route));
  }

  private estimateBufferSize(): number {
    let size = 0;
    for (const event of this.buffer) {
      size += JSON.stringify(event).length;
    }
    return size;
  }

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
