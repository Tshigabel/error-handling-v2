import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { TimelineBufferService } from './timeline-buffer.service';
import { ClickEvent } from '../models/timeline-event.model';
import {
  ERROR_TIMELINE_CONFIG,
  ErrorTimelineConfig,
} from '../models/error-timeline-config';

const ACTIONABLE_SELECTORS = [
  'button',
  'a',
  '[role="button"]',
  'input[type="submit"]',
  '[data-testid]',
];

@Injectable()
export class ClickCaptureService implements OnDestroy {
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private routerSub: Subscription;
  private currentUrl: string;

  constructor(
    private buffer: TimelineBufferService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(ERROR_TIMELINE_CONFIG) private config: ErrorTimelineConfig
  ) {
    this.currentUrl = this.router.url;
    this.evaluateRoute(this.currentUrl);

    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const from = this.currentUrl;
        this.currentUrl = e.urlAfterRedirects;
        this.evaluateRoute(e.urlAfterRedirects);

        this.buffer.append({
          type: 'navigation',
          payload: { from, to: e.urlAfterRedirects },
        });
      });
  }

  start(): void {
    this.clickHandler = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target) return;

      const actionable = this.findActionableAncestor(target);
      if (!actionable) return;

      const payload = this.buildClickEvent(actionable);

      this.ngZone.runOutsideAngular(() => {
        this.buffer.append({ type: 'click', payload });
      });
    };

    document.addEventListener('click', this.clickHandler, true);
  }

  ngOnDestroy(): void {
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
    this.routerSub.unsubscribe();
  }

  private evaluateRoute(url: string): void {
    const rules = this.config.recording;
    const path = url.split('?')[0];

    if (this.matchesRoute(path, rules.ignoreRoutes)) {
      this.buffer.stopRecording();
      return;
    }

    if (this.matchesRoute(path, rules.startRoutes)) {
      if (!this.buffer.recording) {
        this.buffer.startRecording();
      }
      return;
    }
  }

  private matchesRoute(url: string, routes: string[]): boolean {
    return routes.some((route) => {
      if (!route) return false;
      return url === route || url.startsWith(route + '/');
    });
  }

  private findActionableAncestor(el: Element): Element | null {
    let current: Element | null = el;
    while (current && current !== document.documentElement) {
      if (this.isActionable(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  private isActionable(el: Element): boolean {
    return ACTIONABLE_SELECTORS.some((sel) => {
      try {
        return el.matches(sel);
      } catch {
        return false;
      }
    });
  }

  private buildClickEvent(el: Element): ClickEvent {
    const dataTestId = el.getAttribute('data-testid');
    const text = (el.textContent || '').trim().substring(0, 80) || undefined;

    return {
      selector: this.buildSelector(el),
      elementTag: el.tagName.toLowerCase(),
      elementText: text,
      dataTestId: dataTestId || undefined,
      routeUrl: this.currentUrl,
    };
  }

  private buildSelector(el: Element): string {
    const dataTestId = el.getAttribute('data-testid');
    if (dataTestId) return `[data-testid="${dataTestId}"]`;

    const id = el.getAttribute('id');
    if (id) return `#${id}`;

    return this.buildCssPath(el, 5);
  }

  private buildCssPath(el: Element, maxDepth: number): string {
    const parts: string[] = [];
    let current: Element | null = el;

    for (let depth = 0; current && depth < maxDepth; depth++) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;

      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          parts.unshift(`${tag}:nth-child(${index})`);
        } else {
          parts.unshift(tag);
        }
      } else {
        parts.unshift(tag);
      }

      current = parent;
    }

    return parts.join(' > ');
  }
}
