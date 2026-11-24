import { ErrorHandler, ModuleWithProviders, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

import {
  ERROR_TIMELINE_CONFIG,
  ErrorTimelineConfig,
} from './models/error-timeline-config';
import { TimelineBufferService } from './services/timeline-buffer.service';
import { ClickCaptureService } from './services/click-capture.service';
import { ErrorNotificationService } from './services/error-notification.service';
import { ErrorReportService } from './services/error-report.service';
import { TimelineHttpInterceptor } from './interceptors/timeline-http.interceptor';
import { TimelineErrorHandler } from './handlers/timeline-error-handler';
import { ErrorBannerComponent } from './components/error-banner/error-banner.component';
import { ReplayStateService } from './services/replay-state.service';
import { ReplayDriverService } from './services/replay-driver.service';
import { ReplayHttpInterceptor } from './interceptors/replay-http.interceptor';
import { ReplayPanelComponent } from './components/replay-panel/replay-panel.component';

@NgModule({
  imports: [CommonModule, FormsModule],
  declarations: [ErrorBannerComponent, ReplayPanelComponent],
  exports: [ErrorBannerComponent, ReplayPanelComponent],
})
export class ErrorTimelineModule {
  constructor(private clickCapture: ClickCaptureService) {
    this.clickCapture.start();
  }

  static forRoot(
    config: ErrorTimelineConfig
  ): ModuleWithProviders<ErrorTimelineModule> {
    return {
      ngModule: ErrorTimelineModule,
      providers: [
        { provide: ERROR_TIMELINE_CONFIG, useValue: config },
        TimelineBufferService,
        ClickCaptureService,
        ErrorNotificationService,
        ErrorReportService,
        ReplayStateService,
        ReplayDriverService,
        { provide: ErrorHandler, useClass: TimelineErrorHandler },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: TimelineHttpInterceptor,
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ReplayHttpInterceptor,
          multi: true,
        },
      ],
    };
  }
}
