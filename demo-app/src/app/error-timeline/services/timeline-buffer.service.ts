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

    const prefix = this.config.recording.journeySegmentPrefix;
    const minHttp = this.config.recording.minProtectedHttpEvents;

    const valueChanges = this.findValueChangeNavigations(prefix);

    if (valueChanges.length >= 2) {
      const secondToLast = valueChanges[valueChanges.length - 2];
      const trimIndex = secondToLast.index;

      if (this.canTrimTo(trimIndex, minHttp)) {
        this.buffer = this.buffer.slice(trimIndex);
        return;
      }
    }

    const safeCutoff = this.getSafeCutoff(minHttp);
    while (this.buffer.length > safeCutoff && this.estimateBufferSize() > threshold) {
      this.buffer.shift();
    }
  }

  private findValueChangeNavigations(prefix: string): { index: number; value: string }[] {
    const changes: { index: number; value: string }[] = [];
    let lastValue: string | null = null;

    for (let i = 0; i < this.buffer.length; i++) {
      const event = this.buffer[i];
      if (event.type !== 'navigation') continue;

      const nav = event.payload as NavigationEvent;
      const value = this.extractJourneyValue(nav.to, prefix);
      if (value === null) continue;

      if (value !== lastValue) {
        changes.push({ index: i, value });
        lastValue = value;
      }
    }

    return changes;
  }

  private extractJourneyValue(url: string, prefix: string): string | null {
    const path = url.split('?')[0];
    const segments = path.split('/').filter((s) => s.length > 0);

    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i].startsWith(prefix)) {
        return segments[i + 1];
      }
    }

    return null;
  }

  private canTrimTo(trimIndex: number, minHttp: number): boolean {
    let httpCount = 0;
    for (let i = trimIndex; i < this.buffer.length; i++) {
      if (this.buffer[i].type === 'http') {
        httpCount++;
        if (httpCount >= minHttp) return true;
      }
    }
    return false;
  }

  private getSafeCutoff(minHttp: number): number {
    let httpCount = 0;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].type === 'http') {
        httpCount++;
        if (httpCount >= minHttp) return i;
      }
    }
    return 0;
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
