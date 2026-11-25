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
      const formFields: Record<string, string> = {};
      body.forEach((value, key) => {
        if (value instanceof File) {
          files.push(this.extractFileInfo(value, key));
        } else if (value instanceof Blob) {
          files.push({
            fieldName: key,
            fileName: `blob_${key}`,
            fileExtension: this.mimeToExtension(value.type),
            fileSizeBytes: value.size,
            fileSizeReadable: this.formatBytes(value.size),
            fileType: value.type || 'application/octet-stream',
          });
        } else {
          formFields[key] = String(value);
        }
      });
      metadata['files'] = files;
      if (Object.keys(formFields).length > 0) {
        metadata['formFields'] = formFields;
      }
    } else if (body instanceof Blob) {
      metadata['files'] = [{
        fileName: body instanceof File ? body.name : 'blob',
        fileSizeBytes: body.size,
        fileSizeReadable: this.formatBytes(body.size),
        fileType: body.type || 'application/octet-stream',
      }];
    } else if (body instanceof ArrayBuffer) {
      metadata['files'] = [{
        fileName: 'arraybuffer',
        fileSizeBytes: body.byteLength,
        fileSizeReadable: this.formatBytes(body.byteLength),
        fileType: 'application/octet-stream',
      }];
    } else {
      const json = JSON.stringify(body);
      metadata['bodyType'] = typeof body;
      metadata['bodySizeBytes'] = json ? json.length : 0;
      metadata['bodySizeReadable'] = this.formatBytes(json ? json.length : 0);
    }

    return metadata;
  }

  private extractFileInfo(file: File, fieldName: string): Record<string, unknown> {
    const nameParts = file.name.split('.');
    const extension = nameParts.length > 1 ? nameParts.pop() : '';

    return {
      fieldName,
      fileName: file.name,
      fileExtension: extension,
      fileSizeBytes: file.size,
      fileSizeReadable: this.formatBytes(file.size),
      fileType: file.type || this.guessTypeFromExtension(extension || ''),
      lastModified: new Date(file.lastModified).toISOString(),
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  private mimeToExtension(mime: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'text/csv': 'csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-excel': 'xls',
      'application/json': 'json',
      'text/plain': 'txt',
      'application/xml': 'xml',
      'application/zip': 'zip',
    };
    return map[mime] || '';
  }

  private guessTypeFromExtension(ext: string): string {
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      json: 'application/json',
      txt: 'text/plain',
      xml: 'application/xml',
      zip: 'application/zip',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
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
