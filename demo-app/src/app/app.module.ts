import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './pages/home/home.component';
import { AboutComponent } from './pages/about/about.component';
import { ErrorTimelineModule } from './error-timeline/error-timeline.module';

const errorTimelineConfig = {
  reportEndpoint: '/api/error-reports',
  app: {
    name: 'error-timeline-demo',
    version: '0.0.1',
    environment: 'development',
  },
  retention: { maxAgeMs: 120000, minEvents: 10 },
  ignoreUrls: [],
  redactHeaders: ['authorization', 'cookie', 'set-cookie'],
  redactBodyKeys: ['password', 'token', 'secret'],
  maxBodyBytes: 65536,
  replay: { enabled: true },
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
