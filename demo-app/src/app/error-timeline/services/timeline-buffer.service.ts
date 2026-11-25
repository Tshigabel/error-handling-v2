import { Inject, Injectable } from '@angular/core';
import { TimelineEvent } from '../models/timeline-event.model';
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
    return entry;
  }

  snapshot(): TimelineEvent[] {
    this.prune();
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

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
