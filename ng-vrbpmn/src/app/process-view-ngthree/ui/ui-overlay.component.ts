import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  BoundaryKind,
  InteractionMode,
  MultiInstanceType,
  Node,
  NodeType,
  ProcessStateService,
  ValidationIssue
} from '../process-state.service';
import { BOUNDARY_HOST_TYPES, NODE_TYPE_META, PALETTE_GROUPS } from '../process-view.constants';
import { VrSessionService } from '../vr-session.service';
import { IconComponent } from './icon.component';

interface ToolDef {
  mode: InteractionMode;
  label: string;
  key: string;
  hint: string;
}

const SAMPLES = [
  { file: 'samples/research-grant.bpmn', label: 'Research grant application' },
  { file: 'samples/agent.bpmn', label: 'Context-managed AI agent' }
];

@Component({
  selector: 'app-ui-overlay',
  templateUrl: './ui-overlay.component.html',
  styleUrls: ['./ui-overlay.component.scss'],
  standalone: true,
  imports: [IconComponent, DecimalPipe]
})
export class UIOverlayComponent {
  public state = inject(ProcessStateService);
  public vr = inject(VrSessionService);
  @ViewChild('fileInput') public fileInput?: ElementRef<HTMLInputElement>;

  public readonly META = NODE_TYPE_META;
  public readonly paletteGroups = PALETTE_GROUPS;
  public readonly samples = SAMPLES;
  public readonly tools: ToolDef[] = [
    { mode: 'move', label: 'Select / Move', key: 'M', hint: 'Click to select, drag to move. Shift+click adds to the selection.' },
    { mode: 'add', label: 'Add element', key: 'A', hint: 'Pick an element below, then click the floor to place it.' },
    { mode: 'link', label: 'Connect', key: 'L', hint: 'Click a source element, then a target element.' },
    { mode: 'delete', label: 'Delete', key: 'D', hint: 'Click an element or flow to delete it.' }
  ];

  public isInspectorVisible = signal(typeof window === 'undefined' || window.innerWidth > 900);
  public isHelpVisible = signal(false);
  public isSamplesOpen = signal(false);

  public readonly selectedNode = this.state.selectedNode;
  public readonly selectedConnection = this.state.selectedConnection;
  public readonly multiSelectionCount = computed(() => this.state.selectedNodeIds().length);
  public readonly issues = this.state.validationIssues;
  public readonly errorCount = computed(() => this.issues().filter(issue => issue.severity === 'error').length);
  public readonly modeHint = computed(() => {
    const mode = this.state.interactionMode();
    if (mode === 'add') return `${NODE_TYPE_META[this.state.currentNodeType()].label}: ${NODE_TYPE_META[this.state.currentNodeType()].hint}.`;
    if (mode === 'link' && this.state.selectedNodeId()) return 'Now click the target element (Esc to cancel).';
    return this.tools.find(tool => tool.mode === mode)?.hint ?? '';
  });

  public readonly nodeFlows = computed(() => {
    const node = this.selectedNode();
    if (!node) return { incoming: 0, outgoing: 0 };
    const conns = this.state.allConnections();
    return {
      incoming: conns.filter(conn => conn.targetId === node.id).length,
      outgoing: conns.filter(conn => conn.sourceId === node.id).length
    };
  });

  public readonly selectedNodeIssues = computed(() => {
    const node = this.selectedNode();
    return node ? this.issues().filter(issue => issue.nodeId === node.id) : [];
  });

  public readonly childCount = computed(() => {
    const node = this.selectedNode();
    return node ? this.state.allNodes().filter(child => child.parentId === node.id && child.type !== 'boundary').length : 0;
  });

  // ── Labels ──

  public nodeName(id: string | null | undefined): string {
    return (id && this.state.nodeById().get(id)?.name) || id || '—';
  }

  public supportsMultiInstance(type: NodeType): boolean {
    return type === 'usertask' || type === 'servicetask' || type === 'subprocess';
  }

  public canHostBoundary(node: Node): boolean {
    return BOUNDARY_HOST_TYPES.has(node.type);
  }

  public formatTime(epochMs: number): string {
    return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Property editing ──

  private value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  public onNameChange(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    this.state.updateNodeName(id, input.value);
    input.value = this.state.nodeById().get(id)?.name ?? input.value;
  }

  public onIdChange(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    this.state.updateNodeId(id, input.value);
    // Revert the field when the id was rejected.
    if (!this.state.nodeById().has(input.value.trim())) input.value = id;
  }

  public onDescriptionChange(id: string, event: Event) {
    this.state.updateNodeDescription(id, this.value(event));
  }

  public onMultiInstanceChange(id: string, event: Event) {
    const value = this.value(event);
    this.state.updateNodeMultiInstance(id, value === 'none' ? null : (value as MultiInstanceType));
  }

  public onBoundaryKindChange(id: string, event: Event) {
    this.state.updateBoundary(id, { boundaryKind: this.value(event) as BoundaryKind });
  }

  public onInterruptingChange(id: string, event: Event) {
    this.state.updateBoundary(id, { cancelActivity: (event.target as HTMLInputElement).checked });
  }

  public onFlowNameChange(id: string, event: Event) {
    this.state.updateConnection(id, { name: this.value(event).trim() });
  }

  public onFlowConditionChange(id: string, event: Event) {
    this.state.updateConnection(id, { condition: this.value(event).trim() || undefined });
  }

  public resetRoute(id: string) {
    this.state.updateConnection(id, { waypoints: undefined });
    this.state.statusMessage.set('Flow re-routed automatically.');
  }

  public onProcessIdChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.state.updateProcessId(input.value);
    input.value = this.state.processId();
  }

  public onProcessNameChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.state.updateProcessName(input.value);
    input.value = this.state.processName();
  }

  public focusIssue(issue: ValidationIssue) {
    if (issue.nodeId) {
      this.state.setMode('move');
      this.state.selectOnly(issue.nodeId);
    } else if (issue.connectionId) {
      this.state.setMode('move');
      this.state.selectConnection(issue.connectionId);
    }
  }

  public showProcess() {
    this.state.clearSelection();
    this.isInspectorVisible.set(true);
  }

  // ── File actions ──

  private fileStem(): string {
    const stem = this.state.processName().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return stem || 'process';
  }

  private download(content: string, type: string, fileName: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  public newDiagram() {
    this.state.newDiagram();
  }

  public exportBpmn() {
    const fileName = `${this.fileStem()}.bpmn`;
    this.download(this.state.exportBpmnXml(), 'application/xml', fileName);
    this.state.markSaved();
    const errors = this.errorCount();
    this.state.statusMessage.set(
      errors ? `Exported ${fileName} (with ${errors} validation error${errors > 1 ? 's' : ''}).` : `Exported ${fileName}.`
    );
  }

  public saveDiagram() {
    const fileName = `${this.fileStem()}.vrbpmn.json`;
    this.download(this.state.exportDiagramJson(), 'application/json', fileName);
    this.state.markSaved();
    this.state.statusMessage.set(`Saved ${fileName}.`);
  }

  public openFile() {
    this.fileInput?.nativeElement.click();
  }

  public onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const looksLikeBpmn = /<([\w-]+:)?definitions[\s>]/.test(text);
      const ok = looksLikeBpmn ? this.state.importBpmnXml(text) : this.state.importDiagramJson(text);
      if (ok) this.state.statusMessage.set(`Opened ${file.name}. Press Ctrl+Z to undo.`);
      input.value = '';
    });
  }

  public async loadSample(file: string) {
    this.isSamplesOpen.set(false);
    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`${response.status}`);
      if (this.state.importBpmnXml(await response.text())) {
        this.state.statusMessage.set('Loaded sample. Press Ctrl+Z to return to your diagram.');
      }
    } catch {
      this.state.statusMessage.set('Could not load the sample diagram.');
    }
  }

  // ── Keyboard ──

  @HostListener('window:keydown', ['$event'])
  public onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    const key = event.key.toLowerCase();

    if (typing) {
      if (key === 'escape') target?.blur();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (key === 'z') {
        event.preventDefault();
        event.shiftKey ? this.state.redo() : this.state.undo();
      } else if (key === 'y') {
        event.preventDefault();
        this.state.redo();
      } else if (key === 's') {
        event.preventDefault();
        this.saveDiagram();
      } else if (key === 'o') {
        event.preventDefault();
        this.openFile();
      } else if (key === 'a') {
        event.preventDefault();
        this.state.setMode('move');
        this.state.selectAll();
      }
      return;
    }
    if (event.altKey) return;

    if (key === 'escape') {
      if (this.isHelpVisible()) this.isHelpVisible.set(false);
      else if (this.isSamplesOpen()) this.isSamplesOpen.set(false);
      else if (this.state.interactionMode() !== 'move' && !this.state.selectedNodeId()) this.state.setMode('move');
      else this.state.clearSelection();
      return;
    }
    if (key === '?' || (key === '/' && event.shiftKey)) {
      this.isHelpVisible.update(v => !v);
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      this.state.deleteSelected();
      return;
    }

    const modeKeys: Record<string, InteractionMode> = { m: 'move', v: 'move', a: 'add', l: 'link', d: 'delete' };
    if (modeKeys[key]) {
      this.state.setMode(modeKeys[key]);
      return;
    }
    if (key === 's') this.state.toggleSnap();
    if (key === 'f') this.state.requestFrame();
    if (key === 'i') this.isInspectorVisible.update(v => !v);

    const nodeType = (Object.keys(NODE_TYPE_META) as NodeType[]).find(type => NODE_TYPE_META[type].shortcut.toLowerCase() === key);
    if (nodeType) {
      this.state.setMode('add');
      this.state.setNodeType(nodeType);
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  public onDocumentPointerDown(event: PointerEvent) {
    if (!this.isSamplesOpen()) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.samples')) this.isSamplesOpen.set(false);
  }
}
