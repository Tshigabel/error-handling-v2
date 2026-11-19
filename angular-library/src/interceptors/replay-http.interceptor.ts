import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ReplayStateService } from '../services/replay-state.service';

@Injectable()
export class ReplayHttpInterceptor implements HttpInterceptor {
  constructor(private replayState: ReplayStateService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (!this.replayState.isActive()) {
      return next.handle(req);
    }

    const match = this.replayState.findMatchingHttpResponse(
      req.method,
      req.urlWithParams
    );

    if (!match) {
      console.warn(
        `[Replay] No matching recorded response for ${req.method} ${req.url}`
      );
      return next.handle(req);
    }

    const { event } = match;
    const delay = event.durationMs || 0;

    return timer(delay).pipe(
      switchMap(() => {
        if (event.error) {
          return throwError(
            new HttpErrorResponse({
              status: event.status || 0,
              statusText: event.error.message,
              url: req.url,
              error: event.responseBody,
            })
          );
        }

        return of(
          new HttpResponse({
            status: event.status || 200,
            body: event.responseBody,
            url: req.url,
          })
        );
      })
    );
  }
}
