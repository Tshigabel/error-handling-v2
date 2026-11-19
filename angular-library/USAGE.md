# Usage — Error Timeline Capture & Replay

## 1. Import in your AppModule

```typescript
import { ErrorTimelineModule } from '@yourorg/error-timeline';
import { environment } from '../environments/environment';

@NgModule({
  imports: [
    BrowserModule,
    HttpClientModule,
    ErrorTimelineModule.forRoot({
      reportEndpoint: '/api/error-reports',
      app: {
        name: 'my-app',
        version: '1.0.0',
        environment: environment.production ? 'production' : 'development',
      },
      retention: { maxAgeMs: 120_000, minEvents: 10 },
      ignoreUrls: [/\/health$/, /\/assets\//],
      redactHeaders: ['authorization', 'cookie', 'set-cookie'],
      redactBodyKeys: ['password', 'token', 'secret', 'ssn', 'cardNumber'],
      maxBodyBytes: 65_536,
      replay: { enabled: !environment.production },
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## 2. Add components to your root template

```html
<!-- app.component.html -->
<router-outlet></router-outlet>

<!-- Always present — shows itself when an error fires -->
<etl-error-banner></etl-error-banner>

<!-- Dev-only replay panel (only renders when replay.enabled is true) -->
<etl-replay-panel *ngIf="showReplay"></etl-replay-panel>
```

## 3. Interceptor ordering

The module registers interceptors via `HTTP_INTERCEPTORS` multi-provider.
When replay is enabled, `ReplayHttpInterceptor` is registered **before**
`TimelineHttpInterceptor`, so replayed responses are served before the
capture interceptor records them. If your app has its own interceptors
(auth, caching, etc.), import `ErrorTimelineModule` **after** those modules
so the timeline interceptor sits outermost.

## 4. Spring Backend

Requires these dependencies (Maven):

```xml
<dependency>
  <groupId>software.amazon.awssdk</groupId>
  <artifactId>s3</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

Configure `application.yml`:

```yaml
error-report:
  s3:
    bucket: your-error-reports-bucket
    region: us-east-1
```
