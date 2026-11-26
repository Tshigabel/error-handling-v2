import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { ReplayStateService } from './replay-state.service';
import {
  ClickEvent,
  InputChangeEvent,
  NavigationEvent,
  TimelineEvent,
} from '../models/timeline-event.model';

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'finished';

@Injectable()
export class ReplayDriverService {
  status$ = new BehaviorSubject<ReplayStatus>('idle');
  currentEvent$ = new BehaviorSubject<TimelineEvent | null>(null);
  log$ = new Subject<string>();

  private index = 0;
  private speed = 1;
  private timeoutId: any = null;
  private cursorEl: HTMLElement | null = null;

  constructor(
    private replayState: ReplayStateService,
    private router: Router,
    private ngZone: NgZone
  ) {}

  setSpeed(factor: number): void {
    this.speed = factor;
  }

  play(): void {
    if (!this.replayState.isActive()) return;

    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      return;
    }

    this.ensureCursor();

    if (this.index === 0) {
      const report = this.replayState.getReport();
      if (report && report.initialRoute) {
        this.ngZone.run(() => {
          return this.router.navigateByUrl(report.initialRoute);
        }).then(() => {
          this.status$.next('playing');
          this.processNext();
        });
        return;
      }
    }

    this.status$.next('playing');
    this.processNext();
  }

  pause(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.status$.next('paused');
  }

  step(): void {
    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      return;
    }
    this.ensureCursor();
    this.executeEvent(timeline[this.index]);
  }

  reset(): void {
    this.pause();
    this.index = 0;
    this.currentEvent$.next(null);
    this.status$.next('idle');
    this.removeCursor();
  }

  private processNext(): void {
    const timeline = this.replayState.getTimeline();

    if (this.index >= timeline.length) {
      this.status$.next('finished');
      this.log$.next('Replay finished.');
      this.removeCursor();
      return;
    }

    if (this.status$.value !== 'playing') return;

    const event = timeline[this.index];
    this.executeEvent(event);
  }

  private executeEvent(event: TimelineEvent): void {
    this.currentEvent$.next(event);
    this.replayState.currentEventIndex$.next(this.index);
    this.log$.next(`[${event.seq}] ${event.type}: ${this.describeEvent(event)}`);

    switch (event.type) {
      case 'navigation':
        this.handleNavigation(event.payload as NavigationEvent).then(() => {
          this.index++;
          this.scheduleNext(event);
        });
        return;
      case 'click':
        this.handleClick(event.payload as ClickEvent).then(() => {
          this.index++;
          this.scheduleNext(event);
        });
        return;
      case 'input':
        this.handleInput(event.payload as InputChangeEvent).then(() => {
          this.index++;
          this.scheduleNext(event);
        });
        return;
      case 'http':
        this.handleHttp(event);
        break;
      case 'error':
        this.log$.next('ERROR EVENT — this is where production failed.');
        this.pause();
        this.index++;
        return;
    }

    this.index++;
    this.scheduleNext(event);
  }

  private handleNavigation(nav: NavigationEvent): Promise<boolean> {
    return this.ngZone.run(() => {
      return this.router.navigateByUrl(nav.to);
    });
  }

  private handleClick(click: ClickEvent): Promise<void> {
    return this.findElement(click, 5000).then((target) => {
      if (!target) {
        this.log$.next(`WARNING: element not found: ${click.selector}`);
        return Promise.resolve();
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      return this.animateCursorTo(target).then(() => {
        return this.clickAndWaitForDomChange(target as HTMLElement);
      });
    });
  }

  private findElement(click: ClickEvent, timeoutMs: number): Promise<Element | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        const el = this.resolveElement(click);
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  private resolveElement(click: ClickEvent): Element | null {
    return this.trySelector(click.selector)
      || this.tryDataTestId(click.dataTestId)
      || this.tryId(click.elementId)
      || this.tryFormControlName(click.formControlName, click.elementTag)
      || this.tryAriaLabel(click.ariaLabel, click.elementTag)
      || this.tryNameAttr(click.name, click.elementTag)
      || this.tryRoleAndText(click.role, click.elementText, click.elementTag)
      || this.tryTagAndText(click.elementTag, click.elementText)
      || this.tryClasses(click.classes, click.elementTag);
  }

  private trySelector(selector: string): Element | null {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  private tryDataTestId(testId: string | undefined): Element | null {
    if (!testId) return null;
    try {
      return document.querySelector(`[data-testid="${CSS.escape(testId)}"]`);
    } catch {
      return null;
    }
  }

  private tryId(id: string | undefined): Element | null {
    if (!id) return null;
    return document.getElementById(id);
  }

  private tryFormControlName(fcn: string | undefined, tag: string): Element | null {
    if (!fcn) return null;
    try {
      return document.querySelector(`${tag}[formcontrolname="${CSS.escape(fcn)}"]`)
        || document.querySelector(`[formcontrolname="${CSS.escape(fcn)}"]`)
        || document.querySelector(`${tag}[ng-reflect-name="${CSS.escape(fcn)}"]`)
        || document.querySelector(`[ng-reflect-name="${CSS.escape(fcn)}"]`);
    } catch {
      return null;
    }
  }

  private tryAriaLabel(label: string | undefined, tag: string): Element | null {
    if (!label) return null;
    try {
      return document.querySelector(`${tag}[aria-label="${CSS.escape(label)}"]`)
        || document.querySelector(`[aria-label="${CSS.escape(label)}"]`);
    } catch {
      return null;
    }
  }

  private tryNameAttr(name: string | undefined, tag: string): Element | null {
    if (!name) return null;
    try {
      return document.querySelector(`${tag}[name="${CSS.escape(name)}"]`);
    } catch {
      return null;
    }
  }

  private tryRoleAndText(role: string | undefined, text: string | undefined, tag: string): Element | null {
    if (!role || !text) return null;
    const selector = role ? `${tag}[role="${CSS.escape(role)}"]` : tag;
    try {
      const candidates = document.querySelectorAll(selector);
      for (let i = 0; i < candidates.length; i++) {
        const elText = (candidates[i].textContent || '').trim().substring(0, 80);
        if (elText === text) return candidates[i];
      }
    } catch {}
    return null;
  }

  private tryTagAndText(tag: string, text: string | undefined): Element | null {
    if (!text || !tag) return null;
    try {
      const candidates = document.querySelectorAll(tag);
      for (let i = 0; i < candidates.length; i++) {
        const elText = (candidates[i].textContent || '').trim().substring(0, 80);
        if (elText === text) return candidates[i];
      }
    } catch {}
    return null;
  }

  private tryClasses(classes: string[] | undefined, tag: string): Element | null {
    if (!classes || classes.length === 0 || !tag) return null;
    try {
      const selector = tag + classes.map((c) => `.${CSS.escape(c)}`).join('');
      const candidates = document.querySelectorAll(selector);
      if (candidates.length === 1) return candidates[0];
    } catch {}
    return null;
  }

  private clickAndWaitForDomChange(el: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      let debounceTimer: any = null;
      let resolved = false;

      const done = () => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        if (debounceTimer) clearTimeout(debounceTimer);
        resolve();
      };

      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(done, 150);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      this.ngZone.run(() => {
        this.dispatchMouseSequence(el);
      });

      setTimeout(done, 2000);
    });
  }

  private dispatchMouseSequence(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: cx,
      clientY: cy,
      button: 0,
    };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  private handleInput(input: InputChangeEvent): Promise<void> {
    return this.findInputElement(input, 5000).then((target) => {
      if (!target) {
        this.log$.next(`WARNING: input element not found: ${input.selector}`);
        return Promise.resolve();
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      return this.animateCursorTo(target).then(() => {
        this.ngZone.run(() => {
          this.setInputValue(target as HTMLElement, input);
        });
      });
    });
  }

  private setInputValue(el: HTMLElement, input: InputChangeEvent): void {
    const inputEl = el as HTMLInputElement;

    if (input.inputType === 'checkbox' || input.inputType === 'radio') {
      inputEl.checked = input.value as boolean;
    } else if (input.elementTag === 'select') {
      (el as HTMLSelectElement).value = input.value as string;
    } else {
      inputEl.value = input.value as string;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    this.highlightElement(el);
  }

  private findInputElement(input: InputChangeEvent, timeoutMs: number): Promise<Element | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        const el = this.resolveInputElement(input);
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  private resolveInputElement(input: InputChangeEvent): Element | null {
    return this.trySelector(input.selector)
      || this.tryDataTestId(input.dataTestId)
      || this.tryId(input.elementId)
      || this.tryFormControlName(input.formControlName, input.elementTag)
      || this.tryAriaLabel(input.ariaLabel, input.elementTag)
      || this.tryNameAttr(input.name, input.elementTag)
      || this.tryClasses(input.classes, input.elementTag);
  }

  private handleHttp(_event: TimelineEvent): void {
    // HTTP events are consumed passively by ReplayHttpInterceptor
  }

  private scheduleNext(currentEvent: TimelineEvent): void {
    const timeline = this.replayState.getTimeline();
    if (this.index >= timeline.length) {
      this.status$.next('finished');
      this.removeCursor();
      return;
    }

    const nextEvent = timeline[this.index];
    const currentTs = new Date(currentEvent.timestamp).getTime();
    const nextTs = new Date(nextEvent.timestamp).getTime();
    const delay = Math.max(0, (nextTs - currentTs) / this.speed);

    this.timeoutId = setTimeout(() => this.processNext(), delay);
  }

  // ── Visual cursor ──

  private ensureCursor(): void {
    if (this.cursorEl && document.body.contains(this.cursorEl)) return;

    const el = document.createElement('div');
    el.id = 'replay-cursor';
    el.style.cssText = [
      'position: fixed',
      'width: 20px',
      'height: 20px',
      'border-radius: 50%',
      'background: rgba(49, 130, 206, 0.6)',
      'border: 2px solid #3182ce',
      'pointer-events: none',
      'z-index: 999999',
      'transition: left 0.3s ease, top 0.3s ease',
      'transform: translate(-50%, -50%)',
      'box-shadow: 0 0 12px rgba(49, 130, 206, 0.4)',
      'left: 50%',
      'top: 50%',
    ].join('; ');
    document.body.appendChild(el);
    this.cursorEl = el;
  }

  private removeCursor(): void {
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl);
    }
    this.cursorEl = null;
  }

  private animateCursorTo(target: Element): Promise<void> {
    return new Promise((resolve) => {
      if (!this.cursorEl) {
        resolve();
        return;
      }

      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      this.cursorEl.style.left = `${cx}px`;
      this.cursorEl.style.top = `${cy}px`;

      const onEnd = () => {
        if (this.cursorEl) {
          this.cursorEl.removeEventListener('transitionend', onEnd);
        }
        this.showClickRipple(cx, cy);
        resolve();
      };

      this.cursorEl.addEventListener('transitionend', onEnd);
      setTimeout(onEnd, 400);
    });
  }

  private showClickRipple(x: number, y: number): void {
    const ripple = document.createElement('div');
    ripple.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 999998',
      'border-radius: 50%',
      'border: 2px solid #3182ce',
      'width: 10px',
      'height: 10px',
      'transform: translate(-50%, -50%)',
      'animation: replay-ripple 0.5s ease-out forwards',
      `left: ${x}px`,
      `top: ${y}px`,
    ].join('; ');

    if (!document.getElementById('replay-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'replay-ripple-style';
      style.textContent = `
        @keyframes replay-ripple {
          0%   { width: 10px; height: 10px; opacity: 1; }
          100% { width: 50px; height: 50px; opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 600);
  }

  // ── Helpers ──

  private highlightElement(el: Element): void {
    const htmlEl = el as HTMLElement;
    const original = htmlEl.style.outline;
    htmlEl.style.outline = '3px solid #3182ce';
    setTimeout(() => (htmlEl.style.outline = original), 1500);
  }

  private describeEvent(event: TimelineEvent): string {
    switch (event.type) {
      case 'http':
        return `${(event.payload as any).method} ${(event.payload as any).url}`;
      case 'click':
        return `${(event.payload as any).elementTag} "${(event.payload as any).elementText || ''}"`;
      case 'navigation':
        return `${(event.payload as any).from} → ${(event.payload as any).to}`;
      case 'input':
        return `${(event.payload as any).elementTag}[${(event.payload as any).name || (event.payload as any).elementId || ''}] = "${(event.payload as any).value}"`;
      case 'error':
        return (event.payload as any).message;
      default:
        return '';
    }
  }
}
