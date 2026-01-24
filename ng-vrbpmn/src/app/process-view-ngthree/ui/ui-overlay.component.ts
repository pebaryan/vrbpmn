import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProcessStateService, InteractionMode, NodeType } from '../process-state.service';

@Component({
  selector: 'app-ui-overlay',
  template: `
    <div id="process-header">
      <div class="header-line"></div>
      <div class="header-content">
        <h1 class="header-title">FUTURISTIC PROCESS MAP v1.0</h1>
        <span class="header-sub">SYSTEM STATUS: ACTIVE</span>
      </div>
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
    </div>

    <div id="toolbar-bottom" *ngIf="state.interactionMode() === 'add'">
      <button *ngFor="let type of nodeTypes" class="node-btn" [class.active]="state.currentNodeType() === type" (click)="state.setNodeType(type)">
        {{type | uppercase}}
      </button>
    </div>

    <div id="property-sidebar" [class.hidden]="!isSidebarVisible()">
      <div class="sidebar-header">NODE PROPERTIES</div>
      <div class="sidebar-body" *ngIf="selectedNode() as node; else emptyState">
        <div class="prop-group">
          <label>NODE ID</label>
          <div class="prop-val">{{node.id}}</div>
        </div>
        <div class="prop-group">
          <label>TYPE</label>
          <div class="prop-val">{{node.type | uppercase}}</div>
        </div>
        <div class="prop-group">
            <label>NAME</label>
            <div class="prop-val">{{node.name}}</div>
        </div>
        <p>This node represents a {{node.type.toUpperCase()}} step in the futuristic automated workflow.</p>
      </div>
      <ng-template #emptyState>
        <div class="sidebar-body">
          <p class="empty-state">Select a node to view detailed properties...</p>
        </div>
      </ng-template>
      <div class="sidebar-footer">
        <button class="action-btn" (click)="state.openModal()">VIEW DETAILS</button>
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
        <p id="statusbar-content">{{state.statusMessage()}}</p>
      </div>
    </div>
  `,
  styleUrls: ['./ui-overlay.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class UIOverlayComponent {
  public state = inject(ProcessStateService);
  public isSidebarVisible = signal(true);

  public nodeTypes: NodeType[] = ['start', 'usertask', 'servicetask', 'xgateway', 'pgateway', 'terminal'];

  public selectedNode = () => this.state.allNodes().find(n => n.id === this.state.selectedNodeId());
}
