import { Component, ElementRef, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ReplayStateService } from '../../services/replay-state.service';
import {
  ReplayDriverService,
  ReplayStatus,
} from '../../services/replay-driver.service';
import { ErrorReportService } from '../../services/error-report.service';
import {
  ErrorReport,
  HttpEvent,
  ClickEvent,
  NavigationEvent,
  ErrorEvent,
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
        <div class="etl-replay-header">
          <h3>Replay: {{ report?.triggeringError?.message }}</h3>
          <div class="etl-replay-buttons">
            <button (click)="driver.play()" [disabled]="status === 'playing'">&#9654; Play</button>
            <button (click)="driver.pause()" [disabled]="status !== 'playing'">&#10074;&#10074; Pause</button>
            <button (click)="driver.step()">&#9654;| Step</button>
            <button (click)="driver.reset()">&#8634; Reset</button>
            <select [(ngModel)]="speed" (ngModelChange)="onSpeedChange()">
              <option [ngValue]="1">1x</option>
              <option [ngValue]="2">2x</option>
              <option [ngValue]="5">5x</option>
            </select>
            <button class="etl-btn-stop" (click)="stop()">Stop</button>
          </div>
        </div>

        <!-- Search & filter bar -->
        <div class="etl-search-bar">
          <input
            [(ngModel)]="searchTerm"
            (ngModelChange)="applyFilter()"
            placeholder="Search by URL, method, status, element, route..."
          />
          <div class="etl-filter-chips">
            <button
              *ngFor="let t of filterTypes"
              [class.etl-chip-active]="activeFilter === t"
              (click)="toggleFilter(t)"
              class="etl-chip"
            >{{ t }}</button>
          </div>
          <span class="etl-result-count">{{ filteredTimeline.length }} / {{ timeline.length }} events</span>
        </div>

        <!-- Event list -->
        <div class="etl-event-list" #eventList>
          <div
            *ngFor="let event of filteredTimeline; let i = index"
            class="etl-event-row"
            [class.etl-event-row-active]="selectedEvent === event"
            [class.etl-event-row-error]="event.type === 'error'"
            [class.etl-event-row-current]="getOriginalIndex(event) === currentIndex"
            (click)="selectEvent(event)"
          >
            <span class="etl-col-seq">#{{ event.seq }}</span>
            <span class="etl-col-type" [attr.data-type]="event.type">{{ event.type }}</span>
            <span class="etl-col-summary">{{ getEventSummary(event) }}</span>
            <span class="etl-col-status" *ngIf="event.type === 'http'">{{ getHttpStatus(event) }}</span>
            <span class="etl-col-time">{{ event.timestamp | date: 'HH:mm:ss.SSS' }}</span>
          </div>
        </div>

        <!-- Detail panel -->
        <div class="etl-detail-panel" *ngIf="selectedEvent">
          <div class="etl-detail-tabs">
            <button [class.etl-tab-active]="detailTab === 'overview'" (click)="detailTab = 'overview'">Overview</button>
            <button [class.etl-tab-active]="detailTab === 'request'" (click)="detailTab = 'request'"
              *ngIf="selectedEvent.type === 'http'">Request</button>
            <button [class.etl-tab-active]="detailTab === 'response'" (click)="detailTab = 'response'"
              *ngIf="selectedEvent.type === 'http'">Response</button>
            <button [class.etl-tab-active]="detailTab === 'headers'" (click)="detailTab = 'headers'"
              *ngIf="selectedEvent.type === 'http'">Headers</button>
            <button class="etl-detail-close" (click)="selectedEvent = null">&times;</button>
          </div>

          <!-- Overview tab -->
          <div class="etl-detail-body" *ngIf="detailTab === 'overview'">
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http'">
              <span class="etl-label">Method</span>
              <span class="etl-value etl-method">{{ asHttp(selectedEvent).method }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http'">
              <span class="etl-label">URL</span>
              <span class="etl-value etl-url">{{ asHttp(selectedEvent).url }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http' && asHttp(selectedEvent).status">
              <span class="etl-label">Status</span>
              <span class="etl-value" [class.etl-status-ok]="asHttp(selectedEvent).status < 400"
                [class.etl-status-err]="asHttp(selectedEvent).status >= 400">{{ asHttp(selectedEvent).status }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http' && asHttp(selectedEvent).durationMs != null">
              <span class="etl-label">Duration</span>
              <span class="etl-value">{{ asHttp(selectedEvent).durationMs }}ms</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http'">
              <span class="etl-label">Phase</span>
              <span class="etl-value">{{ asHttp(selectedEvent).phase }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'http'">
              <span class="etl-label">Correlation ID</span>
              <span class="etl-value etl-mono">{{ asHttp(selectedEvent).correlationId }}</span>
            </div>

            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'click'">
              <span class="etl-label">Element</span>
              <span class="etl-value">&lt;{{ asClick(selectedEvent).elementTag }}&gt; {{ asClick(selectedEvent).elementText }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'click'">
              <span class="etl-label">Selector</span>
              <span class="etl-value etl-mono">{{ asClick(selectedEvent).selector }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'click' && asClick(selectedEvent).dataTestId">
              <span class="etl-label">data-testid</span>
              <span class="etl-value etl-mono">{{ asClick(selectedEvent).dataTestId }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'click'">
              <span class="etl-label">Route</span>
              <span class="etl-value">{{ asClick(selectedEvent).routeUrl }}</span>
            </div>

            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'navigation'">
              <span class="etl-label">From</span>
              <span class="etl-value">{{ asNav(selectedEvent).from }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'navigation'">
              <span class="etl-label">To</span>
              <span class="etl-value">{{ asNav(selectedEvent).to }}</span>
            </div>

            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'error'">
              <span class="etl-label">Message</span>
              <span class="etl-value etl-status-err">{{ asError(selectedEvent).message }}</span>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'error' && asError(selectedEvent).stack">
              <span class="etl-label">Stack</span>
              <pre class="etl-value etl-stack">{{ asError(selectedEvent).stack }}</pre>
            </div>
            <div class="etl-detail-row" *ngIf="selectedEvent.type === 'error'">
              <span class="etl-label">Source</span>
              <span class="etl-value">{{ asError(selectedEvent).source }}</span>
            </div>
          </div>

          <!-- Request body tab -->
          <div class="etl-detail-body" *ngIf="detailTab === 'request' && selectedEvent.type === 'http'">
            <pre class="etl-json" *ngIf="asHttp(selectedEvent).requestBody">{{ prettifyJson(asHttp(selectedEvent).requestBody) }}</pre>
            <div class="etl-empty" *ngIf="!asHttp(selectedEvent).requestBody">No request body</div>
          </div>

          <!-- Response body tab -->
          <div class="etl-detail-body" *ngIf="detailTab === 'response' && selectedEvent.type === 'http'">
            <pre class="etl-json" *ngIf="asHttp(selectedEvent).responseBody">{{ prettifyJson(asHttp(selectedEvent).responseBody) }}</pre>
            <div class="etl-empty" *ngIf="!asHttp(selectedEvent).responseBody">No response body</div>
            <div class="etl-truncated" *ngIf="asHttp(selectedEvent).truncated">Body was truncated at capture time</div>
          </div>

          <!-- Headers tab -->
          <div class="etl-detail-body" *ngIf="detailTab === 'headers' && selectedEvent.type === 'http'">
            <div *ngIf="asHttp(selectedEvent).requestHeaders">
              <h4>Request Headers</h4>
              <div class="etl-header-row" *ngFor="let h of objectKeys(asHttp(selectedEvent).requestHeaders)">
                <span class="etl-header-key">{{ h }}</span>
                <span class="etl-header-val">{{ asHttp(selectedEvent).requestHeaders[h] }}</span>
              </div>
            </div>
            <div *ngIf="asHttp(selectedEvent).responseHeaders" style="margin-top: 12px;">
              <h4>Response Headers</h4>
              <div class="etl-header-row" *ngFor="let h of objectKeys(asHttp(selectedEvent).responseHeaders)">
                <span class="etl-header-key">{{ h }}</span>
                <span class="etl-header-val">{{ asHttp(selectedEvent).responseHeaders[h] }}</span>
              </div>
            </div>
            <div class="etl-empty" *ngIf="!asHttp(selectedEvent).requestHeaders && !asHttp(selectedEvent).responseHeaders">
              No headers captured
            </div>
          </div>
        </div>

        <!-- Log -->
        <div class="etl-replay-log">
          <div *ngFor="let msg of logs">{{ msg }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .etl-replay-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 420px;
        overflow-y: auto;
        background: #1a202c;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        padding: 12px 16px;
        z-index: 10001;
        border-left: 2px solid #3182ce;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
      }
      h3 { margin: 0 0 8px; font-size: 14px; }
      h4 { margin: 0 0 6px; font-size: 12px; color: #90cdf4; }
      .etl-replay-load-options { display: flex; flex-direction: column; gap: 12px; }
      .etl-replay-load-options > div { display: flex; flex-direction: column; gap: 4px; }
      .etl-replay-load-options input { padding: 4px 8px; box-sizing: border-box; }
      .etl-replay-load-options button { align-self: flex-start; }

      .etl-replay-header { display: flex; flex-direction: column; gap: 8px; }
      .etl-replay-header h3 { font-size: 13px; word-break: break-word; }
      .etl-replay-buttons { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .etl-replay-buttons button,
      .etl-replay-buttons select {
        padding: 4px 10px;
        background: #2d3748;
        color: #e2e8f0;
        border: 1px solid #4a5568;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      }
      .etl-replay-buttons button:disabled { opacity: 0.4; cursor: default; }
      .etl-btn-stop { background: #e53e3e !important; border-color: #e53e3e !important; }

      /* Search bar */
      .etl-search-bar {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 8px 0;
      }
      .etl-search-bar input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        background: #171923;
        color: #e2e8f0;
        border: 1px solid #4a5568;
        border-radius: 4px;
        font-size: 12px;
      }
      .etl-search-bar input::placeholder { color: #718096; }
      .etl-filter-chips { display: flex; gap: 4px; flex-wrap: wrap; }
      .etl-chip {
        padding: 2px 8px;
        background: #2d3748;
        color: #a0aec0;
        border: 1px solid #4a5568;
        border-radius: 12px;
        cursor: pointer;
        font-size: 11px;
        text-transform: capitalize;
      }
      .etl-chip-active { background: #3182ce; color: #fff; border-color: #3182ce; }
      .etl-result-count { color: #718096; font-size: 11px; white-space: nowrap; }

      /* Event list */
      .etl-event-list {
        max-height: 35vh;
        overflow-y: auto;
        border: 1px solid #2d3748;
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .etl-event-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        cursor: pointer;
        border-bottom: 1px solid #2d3748;
      }
      .etl-event-row:hover { background: #2d3748; }
      .etl-event-row-active { background: #2a4365 !important; }
      .etl-event-row-current { border-left: 3px solid #3182ce; background: #2c5282 !important; animation: etl-pulse 0.6s ease-out; }
      @keyframes etl-pulse { 0% { background: #3182ce; } 100% { background: #2c5282; } }
      .etl-event-row-error { border-left: 3px solid #e53e3e; }
      .etl-col-seq { color: #718096; width: 36px; flex-shrink: 0; }
      .etl-col-type {
        width: 70px;
        flex-shrink: 0;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.5px;
      }
      .etl-col-type[data-type="http"] { color: #90cdf4; }
      .etl-col-type[data-type="click"] { color: #9ae6b4; }
      .etl-col-type[data-type="navigation"] { color: #fbd38d; }
      .etl-col-type[data-type="error"] { color: #feb2b2; }
      .etl-col-summary { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .etl-col-status { width: 36px; flex-shrink: 0; text-align: center; font-weight: 600; border-radius: 3px; padding: 1px 4px; font-size: 11px; }
      .etl-col-time { display: none; }

      /* Detail panel */
      .etl-detail-panel {
        background: #171923;
        border: 1px solid #2d3748;
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .etl-detail-tabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid #2d3748;
      }
      .etl-detail-tabs button {
        padding: 6px 14px;
        background: none;
        color: #a0aec0;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: 12px;
      }
      .etl-tab-active { color: #e2e8f0 !important; border-bottom-color: #3182ce !important; }
      .etl-detail-close {
        margin-left: auto !important;
        font-size: 16px !important;
        color: #718096 !important;
      }
      .etl-detail-body {
        padding: 10px 12px;
        max-height: 200px;
        overflow-y: auto;
      }
      .etl-detail-row {
        display: flex;
        gap: 12px;
        padding: 3px 0;
        border-bottom: 1px solid #1a202c;
      }
      .etl-label { color: #718096; width: 110px; flex-shrink: 0; }
      .etl-value { word-break: break-all; }
      .etl-mono { font-family: 'Fira Code', monospace; }
      .etl-url { color: #90cdf4; }
      .etl-method { color: #fbd38d; font-weight: 700; }
      .etl-status-ok { color: #9ae6b4; }
      .etl-status-err { color: #feb2b2; }
      .etl-stack { font-family: 'Fira Code', monospace; font-size: 11px; white-space: pre-wrap; margin: 0; color: #feb2b2; }
      .etl-json {
        font-family: 'Fira Code', monospace;
        font-size: 11px;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
        color: #e2e8f0;
      }
      .etl-empty { color: #718096; font-style: italic; }
      .etl-truncated { color: #fbd38d; margin-top: 8px; font-style: italic; font-size: 11px; }

      .etl-header-row { display: flex; gap: 8px; padding: 2px 0; }
      .etl-header-key { color: #90cdf4; min-width: 150px; font-family: 'Fira Code', monospace; }
      .etl-header-val { color: #e2e8f0; word-break: break-all; font-family: 'Fira Code', monospace; }

      .etl-replay-log {
        max-height: 80px;
        overflow-y: auto;
        padding: 6px;
        background: #171923;
        border-radius: 4px;
        font-family: 'Fira Code', monospace;
        font-size: 11px;
      }
    `,
  ],
})
export class ReplayPanelComponent implements OnInit, OnDestroy {
  @ViewChild('eventList', { static: false }) eventListRef: ElementRef;

  active = false;
  loaded = false;
  report: ErrorReport | null = null;
  timeline: TimelineEvent[] = [];
  filteredTimeline: TimelineEvent[] = [];
  status: ReplayStatus = 'idle';
  currentIndex = -1;
  speed = 1;
  logs: string[] = [];
  reportIdInput = '';
  searchTerm = '';
  activeFilter: string | null = null;
  selectedEvent: TimelineEvent | null = null;
  detailTab = 'overview';

  filterTypes = ['all', 'http', 'click', 'navigation', 'input', 'error'];
  objectKeys = Object.keys;

  private subs: Subscription[] = [];

  private readonly PANEL_WIDTH = '420px';

  constructor(
    private replayState: ReplayStateService,
    public driver: ReplayDriverService,
    private reportService: ErrorReportService,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.active = true;

    this.subs.push(
      this.driver.status$.subscribe((s) => (this.status = s)),
      this.replayState.currentEventIndex$.subscribe((i) => {
        this.currentIndex = i;
        this.scrollToCurrentEvent(i);
      }),
      this.driver.log$.subscribe((msg) => {
        this.logs.push(msg);
        if (this.logs.length > 200) this.logs.shift();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.shrinkBody(false);
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

  selectEvent(event: TimelineEvent): void {
    this.selectedEvent = event;
    this.detailTab = 'overview';
  }

  private scrollToCurrentEvent(index: number): void {
    if (index < 0 || !this.eventListRef) return;
    const event = this.timeline[index];
    if (event) {
      this.selectedEvent = event;
      this.detailTab = 'overview';
    }
    setTimeout(() => {
      const container = this.eventListRef.nativeElement as HTMLElement;
      const row = container.querySelector('.etl-event-row-current') as HTMLElement;
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  getOriginalIndex(event: TimelineEvent): number {
    return this.timeline.indexOf(event);
  }

  toggleFilter(type: string): void {
    this.activeFilter = this.activeFilter === type || type === 'all' ? null : type;
    this.applyFilter();
  }

  applyFilter(): void {
    let result = this.timeline;

    if (this.activeFilter) {
      result = result.filter((e) => e.type === this.activeFilter);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter((e) => {
        const summary = this.getEventSummary(e).toLowerCase();
        const status = this.getHttpStatus(e);
        return (
          summary.includes(term) ||
          e.type.includes(term) ||
          (status && status.includes(term))
        );
      });
    }

    this.filteredTimeline = result;
  }

  getEventSummary(event: TimelineEvent): string {
    switch (event.type) {
      case 'http': {
        const p = event.payload as HttpEvent;
        return `${p.method} ${p.url}`;
      }
      case 'click': {
        const p = event.payload as ClickEvent;
        return `<${p.elementTag}> ${p.elementText || ''} @ ${p.routeUrl}`;
      }
      case 'navigation': {
        const p = event.payload as NavigationEvent;
        return `${p.from} -> ${p.to}`;
      }
      case 'error': {
        const p = event.payload as ErrorEvent;
        return p.message;
      }
      default:
        return '';
    }
  }

  getHttpStatus(event: TimelineEvent): string {
    if (event.type !== 'http') return '';
    const p = event.payload as HttpEvent;
    return p.status != null ? String(p.status) : '';
  }

  asHttp(event: TimelineEvent): HttpEvent {
    if (event.type !== 'http') return event.payload as HttpEvent;

    const clicked = event.payload as HttpEvent;
    const correlationId = clicked.correlationId;

    const pair = this.timeline
      .filter((e) => e.type === 'http' && e !== event)
      .map((e) => e.payload as HttpEvent)
      .find((p) => p.correlationId === correlationId);

    if (!pair) return clicked;

    const req = clicked.phase === 'request' ? clicked : pair;
    const res = clicked.phase === 'response' ? clicked : pair;

    return {
      correlationId,
      phase: clicked.phase,
      method: req.method || res.method,
      url: req.url || res.url,
      requestHeaders: req.requestHeaders,
      requestBody: req.requestBody,
      status: res.status,
      responseHeaders: res.responseHeaders,
      responseBody: res.responseBody,
      durationMs: res.durationMs,
      error: res.error,
      truncated: res.truncated,
    };
  }

  prettifyJson(body: unknown): string {
    if (body == null) return '';
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(body);
    }
  }

  asClick(event: TimelineEvent): ClickEvent {
    return event.payload as ClickEvent;
  }

  asNav(event: TimelineEvent): NavigationEvent {
    return event.payload as NavigationEvent;
  }

  asError(event: TimelineEvent): ErrorEvent {
    return event.payload as ErrorEvent;
  }

  stop(): void {
    this.driver.reset();
    this.replayState.stop();
    this.loaded = false;
    this.timeline = [];
    this.filteredTimeline = [];
    this.report = null;
    this.logs = [];
    this.selectedEvent = null;
    this.searchTerm = '';
    this.activeFilter = null;
    this.shrinkBody(false);
  }

  private loadReport(report: ErrorReport): void {
    this.report = report;
    this.timeline = report.timeline;
    this.filteredTimeline = [...this.timeline];
    this.loaded = true;
    this.replayState.load(report);
    this.logs.push(`Loaded report ${report.reportId} with ${report.timeline.length} events.`);
    this.shrinkBody(true);
  }

  private shrinkBody(shrink: boolean): void {
    this.renderer.setStyle(
      document.body,
      'marginRight',
      shrink ? this.PANEL_WIDTH : ''
    );
    this.renderer.setStyle(
      document.body,
      'transition',
      'margin-right 0.2s ease'
    );
  }
}
