import { Inject, Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { TimelineBufferService } from '../services/timeline-buffer.service';
import { RedactionUtil } from '../services/redaction.util';
import { HttpEvent as TimelineHttpEvent } from '../models/timeline-event.model';
import {
  ERROR_TIMELINE_CONFIG,
  ErrorTimelineConfig,
} from '../models/error-timeline-config';

@Injectable()
export class TimelineHttpInterceptor implements HttpInterceptor {
  constructor(
    private buffer: TimelineBufferService,
    @Inject(ERROR_TIMELINE_CONFIG) private config: ErrorTimelineConfig
  ) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (this.shouldIgnore(req.url)) {
      return next.handle(req);
    }

    const correlationId = this.uuid();
    const startTime = Date.now();

    const requestHeaders = this.headersToRecord(req.headers);
    const redactedHeaders = RedactionUtil.redactHeaders(
      requestHeaders,
      this.config.redactHeaders
    );

    let requestBody = req.body;
    const isFileUpload = this.isFileUpload(req);

    if (isFileUpload) {
      requestBody = this.buildFileMetadata(req.body);
    } else if (requestBody != null) {
      requestBody = RedactionUtil.redactBody(
        requestBody,
        this.config.redactBodyKeys
      );
      const truncated = RedactionUtil.truncateBody(
        requestBody,
        this.config.maxBodyBytes
      );
      requestBody = truncated.body;
    }

    const requestPayload: TimelineHttpEvent = {
      correlationId,
      phase: 'request',
      method: req.method,
      url: req.urlWithParams,
      requestHeaders: redactedHeaders,
      requestBody,
    };

    this.buffer.append({ type: 'http', payload: requestPayload });

    return next.handle(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse) {
          this.recordResponse(
            correlationId,
            req,
            event.status,
            event.body,
            this.headersToRecord(event.headers),
            startTime
          );
        }
      }),
      catchError((error: HttpErrorResponse) => {
        this.recordResponse(
          correlationId,
          req,
          error.status,
          error.error,
          this.headersToRecord(error.headers),
          startTime,
          { message: error.message, name: error.name }
        );
        return throwError(error);
      })
    );
  }

  private recordResponse(
    correlationId: string,
    req: HttpRequest<any>,
    status: number,
    body: unknown,
    headers: Record<string, string>,
    startTime: number,
    error?: { message: string; name: string }
  ): void {
    let responseBody = body;
    let truncated = false;

    if (responseBody != null) {
      responseBody = RedactionUtil.redactBody(
        responseBody,
        this.config.redactBodyKeys
      );
      const result = RedactionUtil.truncateBody(
        responseBody,
        this.config.maxBodyBytes
      );
      responseBody = result.body;
      truncated = result.truncated;
    }

    const payload: TimelineHttpEvent = {
      correlationId,
      phase: 'response',
      method: req.method,
      url: req.urlWithParams,
      status,
      responseHeaders: RedactionUtil.redactHeaders(
        headers,
        this.config.redactHeaders
      ),
      responseBody,
      durationMs: Date.now() - startTime,
      error,
      truncated: truncated || undefined,
    };

    this.buffer.append({ type: 'http', payload });
  }

  private shouldIgnore(url: string): boolean {
    if (url.includes(this.config.reportEndpoint)) return true;
    return this.config.ignoreUrls.some((pattern) => pattern.test(url));
  }

  private isFileUpload(req: HttpRequest<any>): boolean {
    if (req.body instanceof FormData) return true;
    return this.config.recording.fileUploadEndpoints.some((pattern) =>
      pattern.test(req.urlWithParams)
    );
  }

  private buildFileMetadata(body: unknown): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      _placeholder: true,
      _note: 'File content replaced with metadata to reduce recording size',
    };

    if (body instanceof FormData) {
      const files: Record<string, unknown>[] = [];
      body.forEach((value, key) => {
        if (value instanceof File) {
          files.push({
            fieldName: key,
            fileName: value.name,
            fileSize: value.size,
            fileType: value.type || 'unknown',
            lastModified: new Date(value.lastModified).toISOString(),
          });
        } else {
          if (!metadata['formFields']) {
            metadata['formFields'] = {} as Record<string, string>;
          }
          (metadata['formFields'] as Record<string, string>)[key] = String(value);
        }
      });
      metadata['files'] = files;
    } else {
      metadata['bodyType'] = typeof body;
      metadata['bodySize'] = JSON.stringify(body).length;
    }

    return metadata;
  }

  private headersToRecord(headers: HttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of headers.keys()) {
      result[key] = headers.get(key) || '';
    }
    return result;
  }

  private uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
