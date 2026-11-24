import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',
  template: `
    <div class="page">
      <h2>Home Page</h2>
      <p>This page demonstrates the Error Timeline library.</p>

      <div class="actions">
        <button data-testid="btn-success" (click)="makeSuccessRequest()">
          Successful HTTP Request
        </button>
        <button data-testid="btn-404" (click)="make404Request()">
          Trigger 404 Error
        </button>
        <button data-testid="btn-500" (click)="make500Request()">
          Trigger 500 Error
        </button>
        <button data-testid="btn-runtime" (click)="triggerRuntimeError()">
          Trigger Runtime Error
        </button>
      </div>

      <div *ngIf="lastResponse" class="response">
        <h3>Last Response:</h3>
        <pre>{{ lastResponse | json }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
    .actions button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #fff;
    }
    .actions button:nth-child(1) { background: #38a169; }
    .actions button:nth-child(2) { background: #d69e2e; }
    .actions button:nth-child(3) { background: #e53e3e; }
    .actions button:nth-child(4) { background: #805ad5; }
    .response {
      margin-top: 16px;
      padding: 12px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    pre { font-size: 13px; overflow-x: auto; }
  `]
})
export class HomeComponent {
  lastResponse: any = null;

  constructor(private http: HttpClient) {}

  makeSuccessRequest(): void {
    this.http.get('https://jsonplaceholder.typicode.com/posts/1').subscribe(
      res => this.lastResponse = res,
      err => this.lastResponse = err
    );
  }

  make404Request(): void {
    this.http.get('https://jsonplaceholder.typicode.com/posts/99999').subscribe(
      res => this.lastResponse = res,
      err => this.lastResponse = { status: err.status, message: err.message }
    );
  }

  make500Request(): void {
    this.http.get('/api/does-not-exist').subscribe(
      res => this.lastResponse = res,
      err => { throw err; }
    );
  }

  triggerRuntimeError(): void {
    const obj: any = null;
    obj.nonExistent.property;
  }
}
