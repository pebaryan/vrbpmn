import { Component, effect, inject } from '@angular/core';
import { ProcessViewNgThreeComponent } from './process-view-ngthree/process-view-ngthree.component';
import { UIOverlayComponent } from './process-view-ngthree/ui/ui-overlay.component';
import { ProcessStateService } from './process-view-ngthree/process-state.service';

const AUTOSAVE_DELAY_MS = 500;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProcessViewNgThreeComponent, UIOverlayComponent],
  templateUrl: 'app.component.html',
  styleUrl: './app.scss'
})
export class App {
  private state = inject(ProcessStateService);
  private autosaveTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.state.restoreDraft();

    // Keep a local draft so a reload never loses work.
    effect(() => {
      this.state.allNodes();
      this.state.allConnections();
      this.state.processId();
      this.state.processName();
      this.state.isDirty();
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => this.state.persistDraft(), AUTOSAVE_DELAY_MS);
    });
  }
}
