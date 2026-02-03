import { Component, ElementRef, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessStateService, InteractionMode, NodeType } from '../process-state.service';

@Component({
  selector: 'app-ui-overlay',
  template: `
    <div id="process-header">
      <div class="header-line"></div>
      <div class="header-content">
        <h1 class="header-title">VRBPMN</h1>
        <span class="header-sub">{{ state.processName() || 'Process' }}</span>
      </div>
    </div>
    <div class="webxr-banner" *ngIf="webxrSupported() === false">
      WebXR not available on this device. Using desktop mode.
    </div>

    <div id="toolbar-left">
      <button class="tool-btn" [class.active]="state.interactionMode() === 'move'" (click)="state.setMode('move')">
        <span class="icon">✥</span> MOVE
      </button>
      <button class="tool-btn" [class.active]="state.interactionMode() === 'add'" (click)="state.setMode('add')">
        <span class="icon">＋</span> ADD
      </button>
      <button class="tool-btn" [class.active]="state.interactionMode() === 'link'" (click)="state.setMode('link')">
        <span class="icon">🔗</span> LINK
      </button>
      <button class="tool-btn delete" [class.active]="state.interactionMode() === 'delete'" (click)="state.setMode('delete')">
        <span class="icon">✕</span> DEL
      </button>
      <button class="tool-btn" [class.active]="state.snapToGrid()" (click)="state.toggleSnap()">
        <span class="icon">⛶</span> SNAP
      </button>
    </div>

    <div id="toolbar-bottom" *ngIf="state.interactionMode() === 'add'">
      <button *ngFor="let type of nodeTypes" class="node-btn" [class.active]="state.currentNodeType() === type" (click)="state.setNodeType(type)">
        {{type | uppercase}}
      </button>
    </div>

    <div id="toolbar-container" *ngIf="state.activeContainerId() as containerId">
      <span class="container-label">INSIDE:</span>
      <span class="container-name">{{getContainerName(containerId)}}</span>
      <button class="tool-btn exit-btn" (click)="exitContainer()">✕ EXIT</button>
    </div>

    <div id="property-sidebar" [class.hidden]="!isSidebarVisible()">
      <div class="sidebar-header">PROPERTIES</div>
      <div class="sidebar-body">
        <ng-container *ngIf="selectedNode() as node; else processSection">
          <div class="selection-count" *ngIf="state.selectedNodeIds().length > 1">
            {{state.selectedNodeIds().length}} NODES SELECTED
          </div>
          <div class="prop-group">
            <label>NODE ID</label>
            <input class="prop-input" [value]="node.id" (change)="onIdChange(node.id, $event)" />
          </div>
          <div class="prop-group">
            <label>TYPE</label>
            <div class="prop-val">{{node.type | uppercase}}</div>
          </div>
          <div class="prop-group" *ngIf="supportsMultiInstance(node.type)">
            <label>MULTI-INSTANCE</label>
            <select class="prop-input" [value]="node.multiInstance || 'none'" (change)="onMultiInstanceChange(node.id, $event)">
              <option value="none">NONE</option>
              <option value="parallel">PARALLEL</option>
              <option value="sequential">SEQUENTIAL</option>
            </select>
          </div>
          <div class="prop-group">
            <label>NAME</label>
            <input class="prop-input" [value]="node.name" (change)="onNameChange(node.id, $event)" />
          </div>
          <div class="prop-group">
            <label>DESCRIPTION</label>
            <textarea class="prop-textarea" rows="4" [value]="node.description || ''"
              (change)="onDescriptionChange(node.id, $event)"></textarea>
          </div>
        </ng-container>
        <ng-template #processSection>
          <div class="prop-group">
            <label>PROCESS ID</label>
            <input class="prop-input" [value]="state.processId()" (change)="onProcessIdChange($event)" />
          </div>
          <div class="prop-group">
            <label>PROCESS NAME</label>
            <input class="prop-input" [value]="state.processName()" (change)="onProcessNameChange($event)" />
          </div>
          <div class="section-divider"></div>
          <p class="empty-state">Select a node to view detailed properties...</p>
        </ng-template>
      </div>
      <div class="sidebar-footer">
        <button class="action-btn" (click)="state.openModal()">VIEW DETAILS</button>
        <button class="action-btn" (click)="state.saveToLocalStorage()">QUICK SAVE</button>
        <button class="action-btn" (click)="confirmQuickLoad()">QUICK LOAD</button>
        <button class="action-btn" (click)="saveDiagram()">SAVE JSON</button>
        <button class="action-btn" (click)="triggerLoad('json')">LOAD JSON</button>
        <button class="action-btn" (click)="triggerLoad('bpmn')">LOAD BPMN</button>
        <button class="action-btn export-btn" (click)="exportBpmn()">EXPORT BPMN</button>
        <input #fileInput class="hidden-file-input" type="file" accept=".json,.bpmn,.xml,application/json,application/xml,text/xml" (change)="onFileSelected($event)" />
      </div>
    </div>
    <button id="sidebar-toggle" (click)="isSidebarVisible.set(!isSidebarVisible())">⬌</button>

    <!-- Modal -->
    <div id="modal-container" *ngIf="state.showModal()" (click)="state.closeModal()">
      <div id="modal" (click)="$event.stopPropagation()">
        <h3>NODE DETAILS: {{selectedNode()?.name | uppercase}}</h3>
        <p>Information about this process step...</p>
        <div class="modal-content">
            <p><strong>TYPE:</strong> {{selectedNode()?.type | uppercase}}</p>
            <p><strong>POSITION:</strong> 
                X: {{selectedNode()?.position?.x?.toFixed(1)}}, 
                Z: {{selectedNode()?.position?.z?.toFixed(1)}}
            </p>
            <p>This node is part of the futuristic automated workflow system. It is currently in a READY state following process mapping protocols.</p>
        </div>
        <button class="close-btn" (click)="state.closeModal()">CLOSE</button>
      </div>
    </div>

    <div id="statusbar">
      <div class="statusbar-body">
        <p id="statusbar-content">
          {{state.statusMessage()}}
          <span *ngIf="state.isDirty()" class="statusbar-meta statusbar-alert">UNSAVED CHANGES</span>
          <span *ngIf="state.lastSavedAt()" class="statusbar-meta">
            LAST SAVED: {{formatTimestamp(state.lastSavedAt()!)}}
          </span>
        </p>
      </div>
    </div>
  `,
  styleUrls: ['./ui-overlay.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class UIOverlayComponent {
  public state = inject(ProcessStateService);
  public isSidebarVisible = signal(false);
  public webxrSupported = signal<boolean | null>(null);
  @ViewChild('fileInput') public fileInput?: ElementRef<HTMLInputElement>;

  public nodeTypes: NodeType[] = [
    'start',
    'messageStart',
    'messageCatch',
    'usertask',
    'servicetask',
    'subprocess',
    'boundary',
    'xgateway',
    'pgateway',
    'eventgateway',
    'terminal'
  ];

  public selectedNode = () => this.state.allNodes().find(n => n.id === this.state.selectedNodeId());

  ngOnInit() {
    if (!('xr' in navigator)) {
      this.webxrSupported.set(false);
      return;
    }
    navigator.xr?.isSessionSupported('immersive-vr')
      .then((supported) => this.webxrSupported.set(supported))
      .catch(() => this.webxrSupported.set(false));
  }

  public onNameChange(id: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.state.updateNodeName(id, value);
  }

  public onIdChange(id: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.state.updateNodeId(id, value);
  }

  public onDescriptionChange(id: string, event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.state.updateNodeDescription(id, value);
  }

  public onMultiInstanceChange(id: string, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const next = value === 'none' ? null : (value as any);
    this.state.updateNodeMultiInstance(id, next);
  }

  public supportsMultiInstance(type: NodeType): boolean {
    return type === 'usertask' || type === 'servicetask' || type === 'subprocess';
  }

  public onProcessIdChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.state.updateProcessId(value);
  }

  public onProcessNameChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.state.updateProcessName(value);
  }

  public exportBpmn() {
    const xml = this.state.exportBpmnXml();
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'process.bpmn';
    link.click();
    URL.revokeObjectURL(url);
    this.state.statusMessage.set('Exported BPMN XML.');
  }

  public saveDiagram() {
    const json = this.state.exportDiagramJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagram.json';
    link.click();
    URL.revokeObjectURL(url);
    this.state.statusMessage.set('Saved diagram JSON.');
  }

  public triggerLoad(kind: 'json' | 'bpmn') {
    this.fileInput?.nativeElement.click();
  }

  public confirmQuickLoad() {
    const shouldLoad = this.state.isDirty()
      ? window.confirm('Quick load will replace the current diagram. Continue?')
      : true;
    if (shouldLoad) {
      this.state.loadFromLocalStorage();
    }
  }


  public onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const looksLikeBpmn = text.includes('<bpmn:definitions') || text.includes('bpmn:process');
      if (looksLikeBpmn) {
        this.state.importBpmnXml(text);
      } else {
        this.state.importDiagramJson(text);
      }
       input.value = '';
    });
  }

  public getContainerName(id: string): string {
    const node = this.state.allNodes().find(n => n.id === id);
    return node?.name ?? id;
  }

  public exitContainer() {
    this.state.setActiveContainer(null);
  }

  public formatTimestamp(epochMs: number): string {
    return new Date(epochMs).toLocaleString();
  }

  @HostListener('window:keydown', ['$event'])
  public onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

    const key = event.key.toLowerCase();
    if (key === 'm') this.state.setMode('move');
    if (key === 'a') this.state.setMode('add');
    if (key === 'l') this.state.setMode('link');
    if (key === 'd') this.state.setMode('delete');
    if (key === 's') this.state.toggleSnap();

    if (key === 'escape') this.state.clearSelection();
    if (key === 'delete' || key === 'backspace') this.state.deleteSelected();

    const nodeTypeKeys: Record<string, NodeType> = {
      '1': 'start',
      '2': 'messageStart',
      '3': 'messageCatch',
      '4': 'usertask',
      '5': 'servicetask',
      '6': 'subprocess',
      '7': 'xgateway',
      '8': 'pgateway',
      '9': 'eventgateway',
      '0': 'terminal'
    };
    if (nodeTypeKeys[key]) {
      this.state.setMode('add');
      this.state.setNodeType(nodeTypeKeys[key]);
    }
  }
}
