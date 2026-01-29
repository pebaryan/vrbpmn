import { Injectable, signal, computed } from '@angular/core';
import * as THREE from 'three';

export type NodeType =
  | 'start'
  | 'usertask'
  | 'servicetask'
  | 'xgateway'
  | 'pgateway'
  | 'terminal'
  | 'subprocess'
  | 'eventgateway'
  | 'messageStart'
  | 'messageCatch';
export type InteractionMode = 'move' | 'add' | 'link' | 'delete';
export type MultiInstanceType = 'parallel' | 'sequential' | null;

export interface Node {
  id: string;
  type: NodeType;
  position: THREE.Vector3;
  name: string;
  description?: string;
  multiInstance?: MultiInstanceType;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProcessStateService {
  private nodes = signal<Node[]>([]);
  private connections = signal<Connection[]>([]);

  public processId = signal<string>('Process_1');
  public processName = signal<string>('SPEAR Process');

  public interactionMode = signal<InteractionMode>('move');
  public currentNodeType = signal<NodeType>('usertask');
  public selectedNodeId = signal<string | null>(null);
  public selectedNodeIds = signal<string[]>([]);
  public selectedConnectionId = signal<string | null>(null);
  public draggedNodeId = signal<string | null>(null);
  public hoveredNodeId = signal<string | null>(null);
  public hoveredConnectionId = signal<string | null>(null);
  public showModal = signal<boolean>(false);
  public statusMessage = signal<string>('System Ready');
  public lastSavedAt = signal<number | null>(null);
  public isDirty = signal<boolean>(false);
  public snapToGrid = signal<boolean>(true);

  public hoverNode(id: string | null, isHovered: boolean) {
    this.hoveredNodeId.set(isHovered ? id : null);
  }

  public hoverConnection(id: string | null, isHovered: boolean) {
    this.hoveredConnectionId.set(isHovered ? id : null);
  }

  public readonly allNodes = computed(() => this.nodes());
  public readonly allConnections = computed(() => this.connections());

  private nodeCounter = 0;
  private connectionCounter = 0;

  constructor() {
    // Initial nodes based on prototype
    this.initializeDefaultNodes();
  }

  private initializeDefaultNodes() {
    const types: NodeType[] = ['start', 'usertask', 'xgateway', 'servicetask', 'xgateway', 'terminal'];
    const spacing = 5.0;
    const startOffset = (types.length - 1) * spacing * 0.5;

    types.forEach((type, i) => {
      const id = this.getNextId();
      const node: Node = {
        id,
        type,
        position: new THREE.Vector3(i * spacing - startOffset, 0, 0),
        name: `Node ${id}`,
        description: '',
        multiInstance: null
      };
      this.nodes.update(nodes => [...nodes, node]);
      this.isDirty.set(true);

      if (i > 0) {
        const prevNode = this.nodes()[this.nodes().length - 2];
        this.addConnection(prevNode.id, node.id);
      }
    });
  }

  private getNextId(): string {
    return (++this.nodeCounter).toString();
  }

  private makeConnectionId(sourceId: string, targetId: string): string {
    this.connectionCounter += 1;
    return `Flow_${this.connectionCounter}_${sourceId}_${targetId}`;
  }

  public setMode(mode: InteractionMode) {
    this.interactionMode.set(mode);
    this.statusMessage.set(`Mode: ${mode.toUpperCase()}`);
    if (mode !== 'link') {
      this.selectedNodeId.set(null);
      this.selectedNodeIds.set([]);
    }
    if (mode === 'delete') {
      this.selectedNodeId.set(null);
      this.selectedNodeIds.set([]);
      this.selectedConnectionId.set(null);
    }
  }

  public setNodeType(type: NodeType) {
    console.log('Setting node type:', type);
    this.currentNodeType.set(type);
    this.statusMessage.set(`Selected Node Type: ${type.toUpperCase()}`);
  }

  public addNode(position: THREE.Vector3) {
    const type = this.currentNodeType();
    console.log('Adding node of type:', type, 'at', position);
    const id = this.getNextId();
    const newNode: Node = {
      id,
      type,
      position: position.clone(),
      name: `Node ${id}`,
      description: '',
      multiInstance: null
    };
    this.nodes.update(nodes => [...nodes, newNode]);
    this.isDirty.set(true);
    this.statusMessage.set(`Added ${type} at ${position.x.toFixed(1)}, ${position.z.toFixed(1)}`);
  }

  public moveNode(id: string, position: THREE.Vector3) {
    // Replace node with a new position vector to ensure change detection downstream
    let changed = false;
    this.nodes.update(nodes =>
      nodes.map(n => {
        if (n.id !== id) return n;
        changed = true;
        return { ...n, position: position.clone() };
      })
    );
    if (changed) {
      this.isDirty.set(true);
    }
  }

  public deleteNode(id: string) {
    this.nodes.update(nodes => nodes.filter(n => n.id !== id));
    this.connections.update(conns => conns.filter(c => c.sourceId !== id && c.targetId !== id));
    if (this.selectedNodeId() === id) this.selectedNodeId.set(null);
    this.selectedNodeIds.update(ids => ids.filter(nodeId => nodeId !== id));
    if (this.selectedConnectionId()) this.selectedConnectionId.set(null);
    this.isDirty.set(true);
    this.statusMessage.set(`Deleted Node ${id}`);
  }

  public deleteConnection(id: string) {
    this.connections.update(conns => conns.filter(c => c.id !== id));
    if (this.selectedConnectionId() === id) this.selectedConnectionId.set(null);
    this.isDirty.set(true);
    this.statusMessage.set('Deleted Connection');
  }

  public addConnection(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    // Avoid duplicates
    const existing = this.connections().find(c => c.sourceId === sourceId && c.targetId === targetId);
    if (existing) return;

    const sourceNode = this.nodes().find(n => n.id === sourceId);
    const targetNode = this.nodes().find(n => n.id === targetId);

    // Validate nodes exist
    if (!sourceNode) {
      this.statusMessage.set(`Error: Source node ${sourceId} not found`);
      return;
    }
    if (!targetNode) {
      this.statusMessage.set(`Error: Target node ${targetId} not found`);
      return;
    }

    // Validate connection rules
    if (targetNode.type === 'start' || targetNode.type === 'messageStart') {
      this.statusMessage.set('Start node cannot have incoming connections');
      return;
    }
    if (sourceNode.type === 'terminal') {
      this.statusMessage.set('Terminal node cannot have outgoing connections');
      return;
    }

    const id = this.makeConnectionId(sourceId, targetId);
    this.connections.update(conns => [...conns, { id, sourceId, targetId }]);
    this.isDirty.set(true);
    this.statusMessage.set(`Connected ${sourceId} to ${targetId}`);
  }

  public selectNode(id: string) {
    this.selectedConnectionId.set(null);
    if (this.interactionMode() === 'link') {
      const sourceId = this.selectedNodeId();
      if (!sourceId) {
        this.selectedNodeId.set(id);
        this.selectedNodeIds.set([id]);
        this.statusMessage.set('Source node selected. Click target node.');
      } else if (sourceId === id) {
        this.selectedNodeId.set(null);
        this.selectedNodeIds.set([]);
        this.statusMessage.set('Deselected source node.');
      } else {
        this.addConnection(sourceId, id);
        this.selectedNodeId.set(null);
        this.selectedNodeIds.set([]);
      }
    } else if (this.interactionMode() === 'delete') {
      this.deleteNode(id);
    } else if (this.interactionMode() === 'move') {
      this.selectedNodeId.set(id);
      this.selectedNodeIds.set([id]);
      this.draggedNodeId.set(id);
      this.statusMessage.set(`Dragging Node ${id}`);
    } else {
      this.selectedNodeId.set(id);
      this.selectedNodeIds.set([id]);
      this.statusMessage.set(`Selected Node ${id}`);
    }
  }

  public endDrag() {
    this.draggedNodeId.set(null);
  }

  public selectConnection(id: string) {
    this.selectedNodeId.set(null);
    this.selectedNodeIds.set([]);
    this.selectedConnectionId.set(id);
    this.statusMessage.set(`Selected Connection ${id}`);
  }

  public clearSelection() {
    this.selectedNodeId.set(null);
    this.selectedNodeIds.set([]);
    this.selectedConnectionId.set(null);
    this.draggedNodeId.set(null);
    this.statusMessage.set('Selection cleared.');
  }

  public toggleSnap() {
    this.snapToGrid.set(!this.snapToGrid());
    this.statusMessage.set(`Snap to grid: ${this.snapToGrid() ? 'ON' : 'OFF'}`);
  }

  public deleteSelected() {
    const selectedNodes = this.selectedNodeIds();
    const selectedConnection = this.selectedConnectionId();
    if (selectedNodes.length > 0) {
      selectedNodes.forEach(nodeId => this.deleteNode(nodeId));
      this.selectedNodeId.set(null);
      this.selectedNodeIds.set([]);
      return;
    }
    if (selectedConnection) {
      this.deleteConnection(selectedConnection);
      this.selectedConnectionId.set(null);
    }
  }

  public toggleNodeSelection(id: string) {
    if (this.interactionMode() !== 'move') return;
    const selected = new Set(this.selectedNodeIds());
    if (selected.has(id)) {
      selected.delete(id);
      if (this.selectedNodeId() === id) {
        const next = Array.from(selected).at(-1) ?? null;
        this.selectedNodeId.set(next);
      }
    } else {
      selected.add(id);
      this.selectedNodeId.set(id);
    }
    this.selectedNodeIds.set(Array.from(selected));
    this.selectedConnectionId.set(null);
    this.statusMessage.set(`Selected ${this.selectedNodeIds().length} node(s).`);
  }

  public updateNodeName(id: string, name: string) {
    const nextName = name.trim();
    this.nodes.update(nodes => nodes.map(node => (
      node.id === id ? { ...node, name: nextName || node.name } : node
    )));
    this.isDirty.set(true);
  }

  public updateNodeDescription(id: string, description: string) {
    this.nodes.update(nodes => nodes.map(node => (
      node.id === id ? { ...node, description } : node
    )));
    this.isDirty.set(true);
  }

  public updateNodeMultiInstance(id: string, multiInstance: MultiInstanceType) {
    this.nodes.update(nodes => nodes.map(node => (
      node.id === id ? { ...node, multiInstance } : node
    )));
    this.isDirty.set(true);
  }

  public updateNodeId(id: string, nextIdRaw: string) {
    const nextId = nextIdRaw.trim();
    if (!nextId) {
      this.statusMessage.set('Node ID cannot be empty.');
      return;
    }
    if (!this.isValidXmlId(nextId)) {
      this.statusMessage.set('Node ID must start with a letter or underscore and contain only letters, numbers, ., -, or _.');
      return;
    }
    if (nextId === id) {
      return;
    }
    if (this.nodes().some(node => node.id === nextId)) {
      this.statusMessage.set(`Node ID ${nextId} already exists.`);
      return;
    }
    const nodes = this.nodes().map(node => (node.id === id ? { ...node, id: nextId } : node));
    const connections = this.connections().map(conn => {
      const sourceId = conn.sourceId === id ? nextId : conn.sourceId;
      const targetId = conn.targetId === id ? nextId : conn.targetId;
      return {
        ...conn,
        sourceId,
        targetId,
        id: this.makeConnectionId(sourceId, targetId)
      };
    });
    this.nodes.set(nodes);
    this.connections.set(connections);
    this.isDirty.set(true);

    if (this.selectedNodeId() === id) this.selectedNodeId.set(nextId);
    if (this.draggedNodeId() === id) this.draggedNodeId.set(nextId);
    if (this.hoveredNodeId() === id) this.hoveredNodeId.set(nextId);
  }

  public updateProcessId(nextIdRaw: string) {
    const nextId = nextIdRaw.trim();
    if (!nextId) {
      this.statusMessage.set('Process ID cannot be empty.');
      return;
    }
    if (!this.isValidXmlId(nextId)) {
      this.statusMessage.set('Process ID must start with a letter or underscore and contain only letters, numbers, ., -, or _.');
      return;
    }
    if (nextId === this.processId()) {
      return;
    }
    this.processId.set(nextId);
    this.isDirty.set(true);
    this.statusMessage.set('Updated process ID.');
  }

  public updateProcessName(nextNameRaw: string) {
    const nextName = nextNameRaw.trim();
    if (!nextName) {
      this.statusMessage.set('Process name cannot be empty.');
      return;
    }
    if (nextName === this.processName()) {
      return;
    }
    this.processName.set(nextName);
    this.isDirty.set(true);
    this.statusMessage.set('Updated process name.');
  }

  public openModal() {
    if (this.selectedNodeId()) {
      this.showModal.set(true);
    }
  }

  public closeModal() {
    this.showModal.set(false);
  }

  public exportDiagramJson(): string {
    const payload = {
      version: 1,
      processId: this.processId(),
      processName: this.processName(),
      nodes: this.nodes().map(node => ({
        id: node.id,
        type: node.type,
        name: node.name,
        description: node.description ?? '',
        multiInstance: node.multiInstance ?? null,
        position: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z
        }
      })),
      connections: this.connections().map(conn => ({
        id: conn.id,
        sourceId: conn.sourceId,
        targetId: conn.targetId
      }))
    };
    return JSON.stringify(payload, null, 2);
  }

  public saveToLocalStorage(): boolean {
    try {
      const json = this.exportDiagramJson();
      localStorage.setItem('spear.diagram.v1', json);
      this.lastSavedAt.set(Date.now());
      this.isDirty.set(false);
      this.statusMessage.set('Saved to local storage.');
      return true;
    } catch (error) {
      console.error(error);
      this.statusMessage.set('Failed to save locally.');
      return false;
    }
  }

  public loadFromLocalStorage(): boolean {
    try {
      const raw = localStorage.getItem('spear.diagram.v1');
      if (!raw) {
        this.statusMessage.set('No saved diagram found.');
        return false;
      }
      return this.importDiagramJson(raw);
    } catch (error) {
      console.error(error);
      this.statusMessage.set('Failed to load locally.');
      return false;
    }
  }

  public importDiagramJson(raw: string): boolean {
    try {
      const data = JSON.parse(raw) as {
        version?: number;
        processId?: string;
        processName?: string;
        nodes?: Array<{
          id: string;
          type: NodeType;
          name?: string;
          description?: string;
          multiInstance?: MultiInstanceType;
          position?: { x: number; y: number; z: number };
        }>;
        connections?: Array<{ id: string; sourceId: string; targetId: string }>;
      };

      if (!data.nodes || !Array.isArray(data.nodes)) {
        this.statusMessage.set('Invalid file: missing nodes.');
        return false;
      }
      if (!data.connections || !Array.isArray(data.connections)) {
        this.statusMessage.set('Invalid file: missing connections.');
        return false;
      }

      const nodes = data.nodes.map(node => ({
        id: node.id,
        type: node.type,
        name: node.name ?? `Node ${node.id}`,
        description: node.description ?? '',
        multiInstance: node.multiInstance ?? null,
        position: new THREE.Vector3(
          node.position?.x ?? 0,
          node.position?.y ?? 0,
          node.position?.z ?? 0
        )
      }));

      const idSet = new Set(nodes.map(node => node.id));
      const connections = data.connections
        .filter(conn => idSet.has(conn.sourceId) && idSet.has(conn.targetId))
        .map(conn => ({
          id: conn.id,
          sourceId: conn.sourceId,
          targetId: conn.targetId
        }));

      this.nodes.set(nodes);
      this.connections.set(connections);
      const nextProcessId = data.processId ?? this.processId();
      const nextProcessName = data.processName ?? this.processName();
      if (nextProcessId && this.isValidXmlId(nextProcessId)) {
        this.processId.set(nextProcessId);
      }
      if (nextProcessName && nextProcessName.trim()) {
        this.processName.set(nextProcessName.trim());
      }

      this.selectedNodeId.set(null);
      this.draggedNodeId.set(null);
      this.hoveredNodeId.set(null);
      this.hoveredConnectionId.set(null);

      this.nodeCounter = this.deriveNodeCounter(nodes);
      this.connectionCounter = this.deriveConnectionCounter(connections);
      this.isDirty.set(false);
      this.statusMessage.set('Diagram loaded.');
      return true;
    } catch (error) {
      console.error(error);
      this.statusMessage.set('Failed to load file.');
      return false;
    }
  }

  private deriveNodeCounter(nodes: Node[]): number {
    let max = 0;
    nodes.forEach(node => {
      if (/^\d+$/.test(node.id)) {
        const value = Number(node.id);
        if (value > max) max = value;
      }
    });
    return max;
  }

  private deriveConnectionCounter(connections: Connection[]): number {
    let max = 0;
    connections.forEach(conn => {
      const match = /^Flow_(\d+)_/.exec(conn.id);
      if (match) {
        const value = Number(match[1]);
        if (value > max) max = value;
      }
    });
    return max;
  }

  public exportBpmnXml(): string {
    const nodes = this.nodes();
    const connections = this.connections();
    const processId = this.processId();
    const processName = this.processName();

    const scale = 80;
    const margin = 120;
    const positions = nodes.map(node => ({
      id: node.id,
      x: node.position.x * scale,
      y: -node.position.z * scale
    }));
    const minX = Math.min(...positions.map(p => p.x), 0);
    const minY = Math.min(...positions.map(p => p.y), 0);
    const offsetX = margin - minX;
    const offsetY = margin - minY;

    const shapeForType = (type: NodeType) => {
      switch (type) {
        case 'start':
        case 'terminal':
        case 'xgateway':
        case 'pgateway':
        case 'eventgateway':
        case 'messageStart':
        case 'messageCatch':
          return { width: 50, height: 50 };
        case 'subprocess':
        case 'usertask':
        case 'servicetask':
        default:
          return { width: 100, height: 80 };
      }
    };

    const tagForType = (type: NodeType) => {
      switch (type) {
        case 'start':
          return 'bpmn:startEvent';
        case 'messageStart':
          return 'bpmn:startEvent';
        case 'terminal':
          return 'bpmn:endEvent';
        case 'usertask':
          return 'bpmn:userTask';
        case 'servicetask':
          return 'bpmn:serviceTask';
        case 'subprocess':
          return 'bpmn:subProcess';
        case 'xgateway':
          return 'bpmn:exclusiveGateway';
        case 'pgateway':
          return 'bpmn:parallelGateway';
        case 'eventgateway':
          return 'bpmn:eventBasedGateway';
        case 'messageCatch':
          return 'bpmn:intermediateCatchEvent';
        default:
          return 'bpmn:task';
      }
    };

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const nodeXml = nodes.map(node => {
      const tag = tagForType(node.type);
      const name = escapeXml(node.name || '');
      const documentation = node.description?.trim()
        ? `<bpmn:documentation>${escapeXml(node.description)}</bpmn:documentation>`
        : '';
      const multiInstance = node.multiInstance
        ? `<bpmn:multiInstanceLoopCharacteristics isSequential="${node.multiInstance === 'sequential'}" />`
        : '';
      const messageDef = (node.type === 'messageStart' || node.type === 'messageCatch')
        ? `<bpmn:messageEventDefinition id="MessageEvent_${node.id}" />`
        : '';
      return `    <${tag} id="${node.id}" name="${name}">${documentation}${messageDef}${multiInstance}</${tag}>`;
    }).join('\n');

    const flowXml = connections.map(conn =>
      `    <bpmn:sequenceFlow id="${conn.id}" sourceRef="${conn.sourceId}" targetRef="${conn.targetId}" />`
    ).join('\n');

    const shapesXml = nodes.map(node => {
      const pos = positions.find(p => p.id === node.id)!;
      const centerX = pos.x + offsetX;
      const centerY = pos.y + offsetY;
      const { width, height } = shapeForType(node.type);
      const x = centerX - width / 2;
      const y = centerY - height / 2;
      return `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}">
        <dc:Bounds x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width}" height="${height}" />
      </bpmndi:BPMNShape>`;
    }).join('\n');

    const edgesXml = connections.map(conn => {
      const sourcePos = positions.find(p => p.id === conn.sourceId);
      const targetPos = positions.find(p => p.id === conn.targetId);
      if (!sourcePos || !targetPos) return '';
      const sourceCenter = { x: sourcePos.x + offsetX, y: sourcePos.y + offsetY };
      const targetCenter = { x: targetPos.x + offsetX, y: targetPos.y + offsetY };
      return `      <bpmndi:BPMNEdge id="${conn.id}_di" bpmnElement="${conn.id}">
        <di:waypoint x="${sourceCenter.x.toFixed(1)}" y="${sourceCenter.y.toFixed(1)}" />
        <di:waypoint x="${targetCenter.x.toFixed(1)}" y="${targetCenter.y.toFixed(1)}" />
      </bpmndi:BPMNEdge>`;
    }).filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="${escapeXml(processName)}" isExecutable="false">
${nodeXml}
${flowXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${shapesXml}
${edgesXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  }

  public importBpmnXml(raw: string): boolean {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'application/xml');
      const parseError = doc.getElementsByTagName('parsererror')[0];
      if (parseError) {
        this.statusMessage.set('Invalid BPMN XML.');
        return false;
      }

      const nsResolver = (prefix: string | null) => {
        const nsMap: Record<string, string> = {
          bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
          bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
          dc: 'http://www.omg.org/spec/DD/20100524/DC',
          di: 'http://www.omg.org/spec/DD/20100524/DI'
        };
        return prefix ? nsMap[prefix] || null : null;
      };

      const selectAll = (xpath: string) => {
        const result: Element[] = [];
        const iterator = doc.evaluate(xpath, doc, nsResolver, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        let node = iterator.iterateNext();
        while (node) {
          if (node instanceof Element) result.push(node);
          node = iterator.iterateNext();
        }
        return result;
      };

      const processEl = selectAll('//bpmn:process')[0];
      if (processEl) {
        const pid = processEl.getAttribute('id');
        const pname = processEl.getAttribute('name');
        if (pid && this.isValidXmlId(pid)) this.processId.set(pid);
        if (pname) this.processName.set(pname);
      }

      const shapes = selectAll('//bpmndi:BPMNShape');
      const boundsById = new Map<string, { x: number; y: number; w: number; h: number }>();
      shapes.forEach(shape => {
        const bpmnElement = shape.getAttribute('bpmnElement');
        const bounds = shape.getElementsByTagNameNS('http://www.omg.org/spec/DD/20100524/DC', 'Bounds')[0];
        if (!bpmnElement || !bounds) return;
        const x = Number(bounds.getAttribute('x') ?? '0');
        const y = Number(bounds.getAttribute('y') ?? '0');
        const w = Number(bounds.getAttribute('width') ?? '0');
        const h = Number(bounds.getAttribute('height') ?? '0');
        boundsById.set(bpmnElement, { x, y, w, h });
      });

      const elements = selectAll('//bpmn:process/*');
      const nodes: Node[] = [];
      const scale = 80;

      const parseMultiInstance = (el: Element): MultiInstanceType => {
        const mi = el.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'multiInstanceLoopCharacteristics')[0];
        if (!mi) return null;
        const isSeq = mi.getAttribute('isSequential') === 'true';
        return isSeq ? 'sequential' : 'parallel';
      };

      const hasMessageDef = (el: Element) =>
        el.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'messageEventDefinition').length > 0;

      elements.forEach(el => {
        const tag = el.localName;
        const id = el.getAttribute('id');
        if (!id) return;

        let type: NodeType | null = null;
        if (tag === 'startEvent') type = hasMessageDef(el) ? 'messageStart' : 'start';
        if (tag === 'endEvent') type = 'terminal';
        if (tag === 'userTask') type = 'usertask';
        if (tag === 'serviceTask') type = 'servicetask';
        if (tag === 'exclusiveGateway') type = 'xgateway';
        if (tag === 'parallelGateway') type = 'pgateway';
        if (tag === 'eventBasedGateway') type = 'eventgateway';
        if (tag === 'subProcess') type = 'subprocess';
        if (tag === 'intermediateCatchEvent') type = hasMessageDef(el) ? 'messageCatch' : null;
        if (!type) return;

        const bounds = boundsById.get(id);
        const centerX = bounds ? bounds.x + bounds.w / 2 : 0;
        const centerY = bounds ? bounds.y + bounds.h / 2 : 0;
        const position = new THREE.Vector3(centerX / scale, 0, -centerY / scale);

        nodes.push({
          id,
          type,
          name: el.getAttribute('name') ?? `Node ${id}`,
          description: '',
          multiInstance: parseMultiInstance(el),
          position
        });
      });

      const flows = selectAll('//bpmn:sequenceFlow');
      const idSet = new Set(nodes.map(n => n.id));
      const connections = flows
        .map(flow => ({
          id: flow.getAttribute('id') || `Flow_${flow.getAttribute('sourceRef')}_${flow.getAttribute('targetRef')}`,
          sourceId: flow.getAttribute('sourceRef') || '',
          targetId: flow.getAttribute('targetRef') || ''
        }))
        .filter(conn => idSet.has(conn.sourceId) && idSet.has(conn.targetId));

      // Recenter positions to keep nodes near origin
      if (nodes.length) {
        const minX = Math.min(...nodes.map(n => n.position.x));
        const minZ = Math.min(...nodes.map(n => n.position.z));
        nodes.forEach(n => {
          n.position.x -= minX;
          n.position.z -= minZ;
        });
      }

      this.nodes.set(nodes);
      this.connections.set(connections);
      this.nodeCounter = this.deriveNodeCounter(nodes);
      this.connectionCounter = this.deriveConnectionCounter(connections);
      this.isDirty.set(false);
      this.statusMessage.set('Imported BPMN XML.');
      return true;
    } catch (error) {
      console.error(error);
      this.statusMessage.set('Failed to import BPMN XML.');
      return false;
    }
  }

  private isValidXmlId(id: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9._-]*$/.test(id);
  }
}
