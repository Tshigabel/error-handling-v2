import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { AboutComponent } from './pages/about/about.component';
import { ErrorTimelineModule } from './error-timeline/error-timeline.module';
import { environment } from '../environments/environment';

const errorTimelineConfig = {
  reportEndpoint: environment.apiBaseUrl + '/api/error-reports',
  app: {
    name: 'error-timeline-demo',
    version: '0.0.1',
    environment: environment.production ? 'production' : 'development',
  },
  retention: { maxAgeMs: 120000, minEvents: 10 },
  ignoreUrls: [/\/health$/, /\/actuator/, /api\/configuration$/] as RegExp[],
  redactHeaders: ['authorization', 'cookie', 'set-cookie'],
  redactBodyKeys: ['password', 'token', 'secret'],
  maxBodyBytes: 65536,
  replay: { enabled: !environment.production },
  recording: {
    fileUploadEndpoints: [/\/api\/.*upload/, /\/api\/.*import/, /\/api\/.*attach/] as RegExp[],
    maxReportBytes: 2_000_000,
    trimThresholdBytes: 1_500_000,
    journeySegmentPrefix: 'tmo-',
    minProtectedHttpEvents: 3,
  },
};

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    AboutComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    ErrorTimelineModule.forRoot(errorTimelineConfig),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
