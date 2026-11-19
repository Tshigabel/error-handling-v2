import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ErrorNotificationService } from '../../services/error-notification.service';
import { ErrorReportService } from '../../services/error-report.service';
import { ErrorEvent } from '../../models/timeline-event.model';

@Component({
  selector: 'etl-error-banner',
  template: `
    <div class="etl-banner-overlay" *ngIf="visible">
      <div class="etl-banner">
        <div class="etl-banner-header">
          <span class="etl-banner-icon">&#9888;</span>
          <span class="etl-banner-title">An error occurred</span>
          <button class="etl-banner-close" (click)="dismiss()">&times;</button>
        </div>
        <p class="etl-banner-message">{{ errorMessage }}</p>
        <div class="etl-banner-comment">
          <textarea
            [(ngModel)]="userComment"
            placeholder="What were you doing when this happened? (optional)"
            rows="3"
          ></textarea>
        </div>
        <div class="etl-banner-actions">
          <button
            class="etl-btn etl-btn-primary"
            (click)="report()"
            [disabled]="submitting"
          >
            {{ submitting ? 'Sending...' : 'Report' }}
          </button>
          <button class="etl-btn etl-btn-secondary" (click)="dismiss()">
            Dismiss
          </button>
        </div>
        <div *ngIf="reportId" class="etl-banner-success">
          Report sent. Reference: <strong>{{ reportId }}</strong>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .etl-banner-overlay {
        position: fixed;
        top: 0;
        right: 0;
        z-index: 10000;
        padding: 16px;
      }
      .etl-banner {
        background: #fff;
        border: 1px solid #e53e3e;
        border-left: 4px solid #e53e3e;
        border-radius: 8px;
        padding: 16px;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .etl-banner-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }
      .etl-banner-icon {
        color: #e53e3e;
        font-size: 20px;
        margin-right: 8px;
      }
      .etl-banner-title {
        font-weight: 600;
        flex: 1;
      }
      .etl-banner-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
      }
      .etl-banner-message {
        color: #555;
        font-size: 13px;
        margin: 0 0 12px;
        word-break: break-word;
      }
      .etl-banner-comment textarea {
        width: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
        font-size: 13px;
        resize: vertical;
        box-sizing: border-box;
      }
      .etl-banner-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .etl-btn {
        padding: 6px 16px;
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .etl-btn-primary {
        background: #e53e3e;
        color: #fff;
      }
      .etl-btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .etl-btn-secondary {
        background: #f7f7f7;
        color: #333;
        border-color: #ddd;
      }
      .etl-banner-success {
        margin-top: 12px;
        padding: 8px;
        background: #f0fff4;
        border: 1px solid #c6f6d5;
        border-radius: 4px;
        font-size: 12px;
        color: #276749;
      }
    `,
  ],
})
export class ErrorBannerComponent implements OnInit, OnDestroy {
  visible = false;
  submitting = false;
  errorMessage = '';
  userComment = '';
  reportId: string | null = null;

  private currentError: ErrorEvent | null = null;
  private sub: Subscription;

  constructor(
    private notification: ErrorNotificationService,
    private reportService: ErrorReportService
  ) {}

  ngOnInit(): void {
    this.sub = this.notification.error$.subscribe((error) => {
      this.currentError = error;
      this.errorMessage = error.message;
      this.reportId = null;
      this.userComment = '';
      this.visible = true;
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }

  report(): void {
    if (!this.currentError || this.submitting) return;

    this.submitting = true;
    const report = this.reportService.buildReport(
      this.currentError,
      this.userComment || undefined
    );

    this.reportService.submitReport(report).subscribe(
      (res) => {
        this.reportId = res.reportId;
        this.submitting = false;
      },
      () => {
        this.submitting = false;
        this.errorMessage = 'Failed to send report. Please try again.';
      }
    );
  }

  dismiss(): void {
    this.visible = false;
    this.currentError = null;
  }
}
