import { Component } from '@angular/core';
import { ProcessViewNgThreeComponent } from './process-view-ngthree/process-view-ngthree.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProcessViewNgThreeComponent],
  templateUrl: 'app.component.html',
  styleUrl: './app.scss'
})
export class App { }
