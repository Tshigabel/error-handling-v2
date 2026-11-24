import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <nav class="navbar">
      <span class="brand">Error Timeline Demo</span>
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Home</a>
      <a routerLink="/about" routerLinkActive="active">About</a>
    </nav>
    <router-outlet></router-outlet>
    <etl-error-banner></etl-error-banner>
  `,
  styles: [`
    .navbar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 24px;
      background: #1a202c;
      color: #fff;
    }
    .brand { font-weight: 700; font-size: 16px; margin-right: auto; }
    .navbar a { color: #a0aec0; text-decoration: none; }
    .navbar a.active { color: #fff; }
  `]
})
export class AppComponent {}
