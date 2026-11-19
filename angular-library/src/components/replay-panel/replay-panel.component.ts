import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ReplayStateService } from '../../services/replay-state.service';
import {
  ReplayDriverService,
  ReplayStatus,
} from '../../services/replay-driver.service';
import { ErrorReportService } from '../../services/error-report.service';
import {
  ErrorReport,
  TimelineEvent,
} from '../../models/timeline-event.model';

@Component({
  selector: 'etl-replay-panel',
  template: `
    <div class="etl-replay-panel" *ngIf="active">
      <!-- Load section -->
      <div *ngIf="!loaded" class="etl-replay-load">
        <h3>Load Error Report</h3>
        <div class="etl-replay-load-options">
          <div>
            <label>Report ID:</label>
            <input
              [(ngModel)]="reportIdInput"
              placeholder="paste report ID"
            />
            <button (click)="fetchReport()">Fetch</button>
          </div>
          <div>
            <label>Or load file:</label>
            <input type="file" accept=".json" (change)="onFileSelected($event)" />
          </div>
        </div>
      </div>

      <!-- Playback controls -->
      <div *ngIf="loaded" class="etl-replay-controls">
        <h3>
          Replay: {{ report?.triggeringError?.message }}
        </h3>
        <div class="etl-replay-buttons">
          <button (click)="driver.play()" [disabled]="status === 'playing'">
            &#9654; Play
          </button>
          <button (click)="driver.pause()" [disabled]="status !== 'playing'">
            &#10074;&#10074; Pause
          </button>
          <button (click)="driver.step()">&#9654;| Step</button>
          <button (click)="driver.reset()">&#8634; Reset</button>
          <select [(ngModel)]="speed" (ngModelChange)="onSpeedChange()">
            <option [ngValue]="1">1x</option>
            <option [ngValue]="2">2x</option>
            <option [ngValue]="5">5x</option>
          </select>
        </div>

        <!-- Timeline scrubber -->
        <div class="etl-replay-timeline">
          <div
            *ngFor="let event of timeline; let i = index"
            class="etl-replay-event"
            [class.etl-replay-event-active]="i === currentIndex"
            [class.etl-replay-event-error]="event.type === 'error'"
            (click)="selectEvent(i)"
          >
            <span class="etl-event-seq">#{{ event.seq }}</span>
            <span class="etl-event-type">{{ event.type }}</span>
            <span class="etl-event-time">{{
              event.timestamp | date: 'HH:mm:ss.SSS'
            }}</span>
          </div>
        </div>

        <!-- Log -->
        <div class="etl-replay-log">
          <div *ngFor="let msg of logs">{{ msg }}</div>
        </div>

        <button class="etl-btn-stop" (click)="stop()">Stop Replay</button>
      </div>
    </div>
  `,
  styles: [
    `
      .etl-replay-panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 40vh;
        overflow-y: auto;
        background: #1a202c;
        color: #e2e8f0;
        font-family: 'Fira Code', monospace;
        font-size: 12px;
        padding: 12px 16px;
        z-index: 10001;
        border-top: 2px solid #3182ce;
      }
      h3 { margin: 0 0 8px; font-size: 14px; }
      .etl-replay-load-options { display: flex; gap: 16px; flex-wrap: wrap; }
      .etl-replay-load-options input { padding: 4px 8px; }
      .etl-replay-load-options button { margin-left: 4px; }
      .etl-replay-buttons { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
      .etl-replay-buttons button,
      .etl-replay-buttons select {
        padding: 4px 10px;
        background: #2d3748;
        color: #e2e8f0;
        border: 1px solid #4a5568;
        border-radius: 4px;
        cursor: pointer;
      }
      .etl-replay-buttons button:disabled { opacity: 0.4; cursor: default; }
      .etl-replay-timeline {
        display: flex;
        gap: 2px;
        overflow-x: auto;
        padding: 6px 0;
      }
      .etl-replay-event {
        padding: 3px 6px;
        background: #2d3748;
        border-radius: 3px;
        cursor: pointer;
        white-space: nowrap;
        display: flex;
        gap: 4px;
      }
      .etl-replay-event-active { background: #3182ce; }
      .etl-replay-event-error { background: #e53e3e; }
      .etl-event-type { color: #90cdf4; }
      .etl-replay-log {
        max-height: 120px;
        overflow-y: auto;
        margin-top: 8px;
        padding: 6px;
        background: #171923;
        border-radius: 4px;
      }
      .etl-btn-stop {
        margin-top: 8px;
        padding: 4px 12px;
        background: #e53e3e;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `,
  ],
})
export class ReplayPanelComponent implements OnInit, OnDestroy {
  active = false;
  loaded = false;
  report: ErrorReport | null = null;
  timeline: TimelineEvent[] = [];
  status: ReplayStatus = 'idle';
  currentIndex = -1;
  speed = 1;
  logs: string[] = [];
  reportIdInput = '';

  private subs: Subscription[] = [];

  constructor(
    private replayState: ReplayStateService,
    public driver: ReplayDriverService,
    private reportService: ErrorReportService
  ) {}

  ngOnInit(): void {
    this.active = true;

    this.subs.push(
      this.driver.status$.subscribe((s) => (this.status = s)),
      this.replayState.currentEventIndex$.subscribe(
        (i) => (this.currentIndex = i)
      ),
      this.driver.log$.subscribe((msg) => {
        this.logs.push(msg);
        if (this.logs.length > 200) this.logs.shift();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  fetchReport(): void {
    if (!this.reportIdInput.trim()) return;
    this.reportService.fetchReport(this.reportIdInput.trim()).subscribe(
      (report) => this.loadReport(report),
      (err) => this.logs.push(`Failed to fetch report: ${err.message}`)
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const report = JSON.parse(reader.result as string) as ErrorReport;
        this.loadReport(report);
      } catch (e) {
        this.logs.push('Failed to parse report file.');
      }
    };
    reader.readAsText(input.files[0]);
  }

  onSpeedChange(): void {
    this.driver.setSpeed(this.speed);
  }

  selectEvent(index: number): void {
    this.currentIndex = index;
  }

  stop(): void {
    this.driver.reset();
    this.replayState.stop();
    this.loaded = false;
    this.timeline = [];
    this.report = null;
    this.logs = [];
  }

  private loadReport(report: ErrorReport): void {
    this.report = report;
    this.timeline = report.timeline;
    this.loaded = true;
    this.replayState.load(report);
    this.logs.push(`Loaded report ${report.reportId} with ${report.timeline.length} events.`);
  }
}
