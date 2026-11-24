import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  template: `
    <div class="page">
      <h2>About Page</h2>
      <p>Navigate between pages to see navigation events captured in the timeline.</p>
    </div>
  `,
  styles: [`.page { padding: 24px; }`]
})
export class AboutComponent {}
