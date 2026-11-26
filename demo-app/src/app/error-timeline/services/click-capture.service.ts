import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { TimelineBufferService } from './timeline-buffer.service';
import { ClickEvent, InputChangeEvent } from '../models/timeline-event.model';

const ACTIONABLE_SELECTORS = [
  'button',
  'a',
  '[role="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[data-testid]',
  'select',
  'ng-select',
  'label',
  'ngb-alert',
  'ngb-accordion',
  'ngb-panel',
];

const INPUT_DEBOUNCE_MS = 300;

@Injectable()
export class ClickCaptureService implements OnDestroy {
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private inputHandler: ((e: Event) => void) | null = null;
  private changeHandler: ((e: Event) => void) | null = null;
  private routerSub: Subscription;
  private currentUrl: string;
  private inputDebounceMap = new Map<Element, any>();

  constructor(
    private buffer: TimelineBufferService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.currentUrl = this.router.url;

    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const from = this.currentUrl;
        this.currentUrl = e.urlAfterRedirects;
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

    this.inputHandler = (event: Event) => {
      const el = event.target as HTMLElement;
      if (!el || !this.isFormElement(el)) return;

      const existing = this.inputDebounceMap.get(el);
      if (existing) clearTimeout(existing);

      this.inputDebounceMap.set(
        el,
        setTimeout(() => {
          this.inputDebounceMap.delete(el);
          this.recordInputChange(el);
        }, INPUT_DEBOUNCE_MS)
      );
    };

    this.changeHandler = (event: Event) => {
      const el = event.target as HTMLElement;
      if (!el || !this.isFormElement(el)) return;

      const existing = this.inputDebounceMap.get(el);
      if (existing) {
        clearTimeout(existing);
        this.inputDebounceMap.delete(el);
      }

      this.recordInputChange(el);
    };

    document.addEventListener('click', this.clickHandler, true);
    document.addEventListener('input', this.inputHandler, true);
    document.addEventListener('change', this.changeHandler, true);
  }

  ngOnDestroy(): void {
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
    if (this.inputHandler) {
      document.removeEventListener('input', this.inputHandler, true);
    }
    if (this.changeHandler) {
      document.removeEventListener('change', this.changeHandler, true);
    }
    this.inputDebounceMap.forEach((timer) => clearTimeout(timer));
    this.inputDebounceMap.clear();
    this.routerSub.unsubscribe();
  }

  private isFormElement(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  private recordInputChange(el: HTMLElement): void {
    const payload = this.buildInputEvent(el);

    this.ngZone.runOutsideAngular(() => {
      this.buffer.append({ type: 'input', payload });
    });
  }

  private buildInputEvent(el: HTMLElement): InputChangeEvent {
    const inputEl = el as HTMLInputElement;
    const tag = el.tagName.toLowerCase();
    const inputType = inputEl.type || tag;

    let value: string | boolean;
    if (inputType === 'checkbox' || inputType === 'radio') {
      value = inputEl.checked;
    } else if (tag === 'select') {
      value = (el as HTMLSelectElement).value;
    } else {
      value = inputEl.value;
    }

    const dataTestId = el.getAttribute('data-testid') || undefined;
    const id = el.getAttribute('id') || undefined;
    const ariaLabel = el.getAttribute('aria-label') || undefined;
    const name = el.getAttribute('name') || undefined;
    const formControlName = el.getAttribute('formcontrolname')
      || el.getAttribute('ng-reflect-name') || undefined;
    const placeholder = inputEl.placeholder || undefined;
    const classList = Array.from(el.classList);

    let label: string | undefined;
    if (id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelEl) {
        label = (labelEl.textContent || '').trim().substring(0, 80) || undefined;
      }
    }
    if (!label) {
      const parentLabel = el.closest('label');
      if (parentLabel) {
        label = (parentLabel.textContent || '').trim().substring(0, 80) || undefined;
      }
    }

    return {
      selector: this.buildSelector(el),
      elementTag: tag,
      inputType,
      value,
      elementId: id,
      dataTestId,
      ariaLabel,
      name,
      formControlName,
      placeholder,
      label,
      classes: classList.length > 0 ? classList : undefined,
      routeUrl: this.currentUrl,
    };
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
    const tag = el.tagName.toLowerCase();
    if (tag.startsWith('solar-')) return true;
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
    const id = el.getAttribute('id') || undefined;
    const ariaLabel = el.getAttribute('aria-label') || undefined;
    const role = el.getAttribute('role') || undefined;
    const name = el.getAttribute('name') || undefined;
    const formControlName = el.getAttribute('formcontrolname')
      || el.getAttribute('ng-reflect-name') || undefined;
    const classList = Array.from(el.classList);

    return {
      selector: this.buildSelector(el),
      elementTag: el.tagName.toLowerCase(),
      elementText: text,
      dataTestId: dataTestId || undefined,
      elementId: id,
      ariaLabel,
      role,
      name,
      formControlName,
      classes: classList.length > 0 ? classList : undefined,
      routeUrl: this.currentUrl,
    };
  }

  private buildSelector(el: Element): string {
    const dataTestId = el.getAttribute('data-testid');
    if (dataTestId) return `[data-testid="${CSS.escape(dataTestId)}"]`;

    const id = el.getAttribute('id');
    if (id) return `#${CSS.escape(id)}`;

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
