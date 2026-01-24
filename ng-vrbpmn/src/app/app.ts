import { Component } from '@angular/core';
import { ProcessViewNgThreeComponent } from './process-view-ngthree/process-view-ngthree.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProcessViewNgThreeComponent],
  template: '<app-process-view-ngthree></app-process-view-ngthree>',
  styleUrl: './app.scss'
})
export class App { }
