import { Injectable, signal, computed } from '@angular/core';
import * as THREE from 'three';
import {
  BOUNDARY_HOST_TYPES,
  BPMN_DI_CONFIG,
  NODE_TYPE_META,
  SUBPROCESS_CONFIG,
  nodeHalfExtents,
  nodeShape
} from './process-view.constants';

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
  | 'messageCatch'
  | 'boundary';
export type InteractionMode = 'move' | 'add' | 'link' | 'delete';
export type MultiInstanceType = 'parallel' | 'sequential' | null;
export type BoundaryKind = 'timer' | 'message' | 'error' | 'escalation' | null;

export interface Node {
  id: string;
  type: NodeType;
  position: THREE.Vector3;
  name: string;
  description?: string;
  multiInstance?: MultiInstanceType;
  boundaryKind?: BoundaryKind;
  attachedTo?: string | null;
  cancelActivity?: boolean | null;
  parentId?: string | null;
  bounds?: { width: number; height: number } | null;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  name?: string;
  condition?: string;
  waypoints?: Array<{ x: number; z: number }>;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
  connectionId?: string;
}

interface DiagramSnapshot {
  nodes: Node[];
  connections: Connection[];
  processId: string;
  processName: string;
}

const NODE_TYPES = new Set<NodeType>(Object.keys(NODE_TYPE_META) as NodeType[]);
const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';
const DRAFT_STORAGE_KEY = 'spear.diagram.autosave';
const QUICK_SAVE_KEY = 'spear.diagram.v1';
const HISTORY_LIMIT = 100;

function cloneNode(node: Node): Node {
  return {
    ...node,
    position: node.position.clone(),
    bounds: node.bounds ? { ...node.bounds } : node.bounds
  };
}

function cloneConnection(conn: Connection): Connection {
  return { ...conn, waypoints: conn.waypoints?.map(p => ({ ...p })) };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  public statusMessage = signal<string>('System Ready');
  public lastSavedAt = signal<number | null>(null);
  public isDirty = signal<boolean>(false);
  public snapToGrid = signal<boolean>(true);
  public activeContainerId = signal<string | null>(null);

  /** Incremented whenever the whole diagram is replaced, or when the view should re-frame the diagram. */
  public viewRequest = signal(0);

  private undoStack: DiagramSnapshot[] = [];
  private redoStack: DiagramSnapshot[] = [];
  private historyLock = 0;
  private historyVersion = signal(0);
  public readonly canUndo = computed(() => (this.historyVersion(), this.undoStack.length > 0));
  public readonly canRedo = computed(() => (this.historyVersion(), this.redoStack.length > 0));

  public hoverNode(id: string | null, isHovered: boolean) {
    if (isHovered) {
      this.hoveredNodeId.set(id);
    } else if (this.hoveredNodeId() === id) {
      this.hoveredNodeId.set(null);
    }
  }

  public hoverConnection(id: string | null, isHovered: boolean) {
    if (isHovered) {
      this.hoveredConnectionId.set(id);
    } else if (this.hoveredConnectionId() === id) {
      this.hoveredConnectionId.set(null);
    }
  }

  public readonly allNodes = computed(() => this.nodes());
  public readonly allConnections = computed(() => this.connections());
  public readonly nodeById = computed(() => new Map(this.nodes().map(node => [node.id, node])));

  public readonly selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return id ? this.nodeById().get(id) ?? null : null;
  });

  public readonly selectedConnection = computed(() => {
    const id = this.selectedConnectionId();
    return id ? this.connections().find(conn => conn.id === id) ?? null : null;
  });

  public readonly validationIssues = computed(() => this.validate(this.nodes(), this.connections()));

  private nodeCounter = 0;
  private connectionCounter = 0;

  constructor() {
    this.initializeDefaultNodes();
  }

  private initializeDefaultNodes() {
    const add = (type: NodeType, name: string, x: number, z: number) => {
      const node = this.createNode(type, new THREE.Vector3(x, 0, z), null);
      node.name = name;
      this.nodes.update(nodes => [...nodes, node]);
      return node.id;
    };
    const flow = (sourceId: string, targetId: string, name = '') => {
      const id = this.nextConnectionId();
      this.connections.update(conns => [...conns, { id, sourceId, targetId, name }]);
    };

    const start = add('start', 'Request received', -10, -2);
    const review = add('usertask', 'Review request', -5, -2);
    const decide = add('xgateway', 'Approved?', 0, -2);
    const fulfil = add('servicetask', 'Fulfil request', 5, -2);
    const done = add('terminal', 'Done', 10, -2);
    const notify = add('servicetask', 'Notify requester', 5, 3.5);
    const rejected = add('terminal', 'Rejected', 10, 3.5);

    flow(start, review);
    flow(review, decide);
    flow(decide, fulfil, 'Yes');
    flow(fulfil, done);
    flow(decide, notify, 'No');
    flow(notify, rejected);
    this.isDirty.set(false);
  }

  // ── Ids ──

  private nextNodeId(type: NodeType, taken?: Set<string>): string {
    const ids = taken ?? new Set(this.nodes().map(node => node.id));
    const prefix = NODE_TYPE_META[type].idPrefix;
    let id: string;
    do {
      id = `${prefix}_${++this.nodeCounter}`;
    } while (ids.has(id));
    return id;
  }

  private nextConnectionId(): string {
    const ids = new Set(this.connections().map(conn => conn.id));
    let id: string;
    do {
      id = `Flow_${++this.connectionCounter}`;
    } while (ids.has(id));
    return id;
  }

  private createNode(type: NodeType, position: THREE.Vector3, parentId: string | null): Node {
    const id = this.nextNodeId(type);
    return {
      id,
      type,
      position: position.clone(),
      name: `${NODE_TYPE_META[type].label} ${this.nodeCounter}`,
      description: '',
      multiInstance: null,
      boundaryKind: type === 'boundary' ? 'timer' : null,
      attachedTo: null,
      cancelActivity: type === 'boundary' ? true : null,
      parentId,
      bounds: type === 'subprocess'
        ? { width: SUBPROCESS_CONFIG.DEFAULT_WIDTH, height: SUBPROCESS_CONFIG.DEFAULT_DEPTH }
        : null
    };
  }

  // ── History ──

  private snapshot(): DiagramSnapshot {
    return {
      nodes: this.nodes().map(cloneNode),
      connections: this.connections().map(cloneConnection),
      processId: this.processId(),
      processName: this.processName()
    };
  }

  private restore(snapshot: DiagramSnapshot) {
    this.nodes.set(snapshot.nodes.map(cloneNode));
    this.connections.set(snapshot.connections.map(cloneConnection));
    this.processId.set(snapshot.processId);
    this.processName.set(snapshot.processName);

    const nodeIds = new Set(snapshot.nodes.map(node => node.id));
    this.selectedNodeIds.update(ids => ids.filter(id => nodeIds.has(id)));
    if (this.selectedNodeId() && !nodeIds.has(this.selectedNodeId()!)) {
      this.selectedNodeId.set(this.selectedNodeIds().at(-1) ?? null);
    }
    if (this.selectedConnectionId() && !snapshot.connections.some(c => c.id === this.selectedConnectionId())) {
      this.selectedConnectionId.set(null);
    }
    this.draggedNodeId.set(null);
    this.hoveredNodeId.set(null);
    this.hoveredConnectionId.set(null);
    this.isDirty.set(true);
  }

  /** Records the current diagram so the next change can be undone. Nested calls inside a batch are ignored. */
  public checkpoint() {
    if (this.historyLock > 0) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.historyVersion.update(v => v + 1);
  }

  /** Runs several mutations as a single undoable step. */
  public batch<T>(fn: () => T): T {
    this.checkpoint();
    this.historyLock += 1;
    try {
      return fn();
    } finally {
      this.historyLock -= 1;
    }
  }

  public undo() {
    const previous = this.undoStack.pop();
    if (!previous) {
      this.statusMessage.set('Nothing to undo.');
      return;
    }
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    this.historyVersion.update(v => v + 1);
    this.statusMessage.set('Undo.');
  }

  public redo() {
    const next = this.redoStack.pop();
    if (!next) {
      this.statusMessage.set('Nothing to redo.');
      return;
    }
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.historyVersion.update(v => v + 1);
    this.statusMessage.set('Redo.');
  }

  public clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.historyVersion.update(v => v + 1);
  }

  // ── Modes ──

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
    if (mode === 'link') {
      this.selectedNodeIds.set(this.selectedNodeId() ? [this.selectedNodeId()!] : []);
    }
  }

  public setNodeType(type: NodeType) {
    this.currentNodeType.set(type);
    this.statusMessage.set(`Placing: ${NODE_TYPE_META[type].label}. ${NODE_TYPE_META[type].hint}.`);
  }

  // ── Structure helpers ──

  /** The subprocess (or null for the process root) that a node belongs to for BPMN purposes. */
  public containerOf(node: Node, byId: Map<string, Node> = this.nodeById()): string | null {
    let current: Node | undefined = node;
    for (let depth = 0; current && depth < 64; depth += 1) {
      if (current.type !== 'boundary') return current.parentId ?? null;
      current = byId.get(current.attachedTo ?? current.parentId ?? '');
    }
    return null;
  }

  /** Ids of all nodes nested under the given node (subprocess children and attached boundary events). */
  public descendantIds(id: string, nodes: Node[] = this.nodes()): Set<string> {
    const result = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const current = queue.shift()!;
      nodes.forEach(node => {
        if (result.has(node.id) || node.id === id) return;
        if (node.parentId === current || node.attachedTo === current) {
          result.add(node.id);
          queue.push(node.id);
        }
      });
    }
    return result;
  }

  /** Innermost subprocess whose footprint contains the point, ignoring the given ids. */
  public findContainerAt(x: number, z: number, excludeIds: ReadonlySet<string> = new Set()): string | null {
    let best: string | null = null;
    let bestArea = Infinity;
    this.nodes().forEach(node => {
      if (node.type !== 'subprocess' || excludeIds.has(node.id)) return;
      const { halfW, halfD } = nodeHalfExtents(node.type, node.bounds);
      if (Math.abs(x - node.position.x) > halfW || Math.abs(z - node.position.z) > halfD) return;
      const area = halfW * halfD;
      if (area < bestArea) {
        best = node.id;
        bestArea = area;
      }
    });
    return best;
  }

  // ── Node CRUD ──

  /**
   * Adds a node of the current type. With an explicit parentId the position is in world space;
   * otherwise the position is relative to the active container (if any).
   */
  public addNode(position: THREE.Vector3, parentId?: string | null): string {
    const type = this.currentNodeType();
    let containerId: string | null;
    let finalPos = position.clone();

    if (parentId !== undefined) {
      containerId = parentId;
    } else {
      containerId = this.activeContainerId();
      const container = containerId ? this.nodeById().get(containerId) : null;
      if (container) {
        finalPos = container.position.clone().add(position);
      } else {
        containerId = null;
      }
    }

    this.checkpoint();
    const newNode = this.createNode(type, finalPos, containerId);
    this.nodes.update(nodes => [...nodes, newNode]);
    this.selectedNodeId.set(newNode.id);
    this.selectedNodeIds.set([newNode.id]);
    this.selectedConnectionId.set(null);
    this.isDirty.set(true);

    const container = containerId ? this.nodeById().get(containerId) : null;
    const locDesc = container ? `inside ${container.name}` : `at ${finalPos.x.toFixed(1)}, ${finalPos.z.toFixed(1)}`;
    this.statusMessage.set(`Added ${NODE_TYPE_META[type].label} ${locDesc}`);
    return newNode.id;
  }

  /** Attaches a new boundary event to a task or subprocess. Returns the new node id. */
  public attachBoundary(hostId: string): string | null {
    const host = this.nodeById().get(hostId);
    if (!host || !BOUNDARY_HOST_TYPES.has(host.type)) {
      this.statusMessage.set('Boundary events can only be attached to tasks and subprocesses.');
      return null;
    }
    this.checkpoint();
    const siblings = this.nodes().filter(node => node.type === 'boundary' && node.attachedTo === hostId).length;
    const { halfW, halfD } = nodeHalfExtents(host.type, host.bounds);
    const slots = [0.45, -0.45, 0, 0.9, -0.9];
    const slot = slots[siblings % slots.length] * halfW;
    const position = host.position.clone().add(new THREE.Vector3(slot, 0, halfD));

    const node = this.createNode('boundary', position, hostId);
    node.attachedTo = hostId;
    node.name = 'Timer';
    this.nodes.update(nodes => [...nodes, node]);
    this.selectedNodeId.set(node.id);
    this.selectedNodeIds.set([node.id]);
    this.selectedConnectionId.set(null);
    this.isDirty.set(true);
    this.statusMessage.set(`Attached boundary event to ${host.name}`);
    return node.id;
  }

  public setActiveContainer(id: string | null) {
    if (id) {
      const node = this.nodeById().get(id);
      if (!node || node.type !== 'subprocess') {
        this.statusMessage.set('Only subprocess nodes can be containers.');
        return;
      }
      this.activeContainerId.set(id);
      this.statusMessage.set(`Now adding nodes inside: ${node.name}`);
    } else {
      this.activeContainerId.set(null);
      this.statusMessage.set('Now adding nodes at root level.');
    }
  }

  /**
   * Moves a node into (or out of) a subprocess. Does not record history on its own; callers that
   * reparent outside a drag should call checkpoint() first.
   */
  public setParent(id: string, parentId: string | null) {
    const node = this.nodeById().get(id);
    if (!node || node.type === 'boundary' || (node.parentId ?? null) === parentId) return;
    if (parentId) {
      const parent = this.nodeById().get(parentId);
      if (!parent || parent.type !== 'subprocess' || parentId === id || this.descendantIds(id).has(parentId)) return;
    }
    this.nodes.update(nodes => nodes.map(n => (n.id === id ? { ...n, parentId } : n)));
    this.isDirty.set(true);
    const parentName = parentId ? this.nodeById().get(parentId)?.name : null;
    this.statusMessage.set(parentName ? `Moved ${node.name} into ${parentName}` : `Moved ${node.name} to the process root`);
  }

  public resizeSubprocessBounds(id: string, newWidth: number, newDepth: number, offsetX: number = 0, offsetZ: number = 0) {
    this.nodes.update(nodes => {
      const node = nodes.find(n => n.id === id);
      if (!node || node.type !== 'subprocess') return nodes;

      return nodes.map(n => {
        if (n.id === id) {
          // Update subprocess bounds and position
          const pos = n.position.clone();
          pos.x += offsetX;
          pos.z += offsetZ;
          return { ...n, bounds: { width: newWidth, height: newDepth }, position: pos };
        }
        // Child nodes don't need to move since parent is moving
        return n;
      });
    });
    this.isDirty.set(true);
    this.statusMessage.set(`Resized subprocess to ${newWidth.toFixed(1)} × ${newDepth.toFixed(1)}`);
  }

  /** Moves a node; nested children follow unless moveChildren is false. */
  public moveNode(id: string, position: THREE.Vector3, moveChildren = true) {
    // Replace node with a new position vector to ensure change detection downstream
    let changed = false;
    const movedIds = new Set<string>();
    const movedDeltas = new Map<string, { x: number; z: number }>();
    this.nodes.update(nodes => {
      const target = nodes.find(n => n.id === id);
      if (!target) return nodes;

      const nextPositions = new Map<string, THREE.Vector3>();
      nextPositions.set(id, position.clone());
      movedIds.add(id);
      movedDeltas.set(id, {
        x: position.x - target.position.x,
        z: position.z - target.position.z
      });

      const hasChildren = moveChildren && nodes.some(n => n.parentId === id);
      if (hasChildren) {
        const delta = position.clone().sub(target.position);
        const childrenByParent = new Map<string, Node[]>();
        nodes.forEach(node => {
          if (!node.parentId) return;
          const list = childrenByParent.get(node.parentId) ?? [];
          list.push(node);
          childrenByParent.set(node.parentId, list);
        });

        const queue = [...(childrenByParent.get(id) ?? [])];
        while (queue.length) {
          const child = queue.shift()!;
          nextPositions.set(child.id, child.position.clone().add(delta));
          movedIds.add(child.id);
          movedDeltas.set(child.id, { x: delta.x, z: delta.z });
          const grandKids = childrenByParent.get(child.id);
          if (grandKids) queue.push(...grandKids);
        }
      }

      return nodes.map(n => {
        const nextPos = nextPositions.get(n.id);
        if (!nextPos) return n;
        changed = true;
        return { ...n, position: nextPos.clone() };
      });
    });
    if (changed) {
      this.isDirty.set(true);
    }

    if (movedIds.size > 0) {
      const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-4;
      const deltasEqual = (a: { x: number; z: number }, b: { x: number; z: number }) =>
        nearlyEqual(a.x, b.x) && nearlyEqual(a.z, b.z);
      const axisFrom = (a: { x: number; z: number }, b: { x: number; z: number }) => {
        if (nearlyEqual(a.x, b.x)) return 'z';
        if (nearlyEqual(a.z, b.z)) return 'x';
        return null;
      };
      const shiftStart = (original: Array<{ x: number; z: number }>, points: Array<{ x: number; z: number }>, delta: { x: number; z: number }) => {
        if (!points.length) return;
        const base = original[0];
        const axis = original.length > 1 ? axisFrom(original[0], original[1]) : null;
        points[0] = { x: points[0].x + delta.x, z: points[0].z + delta.z };
        if (!axis) return;
        for (let i = 1; i < points.length; i += 1) {
          const p = original[i];
          if (axis === 'x' && !nearlyEqual(p.z, base.z)) break;
          if (axis === 'z' && !nearlyEqual(p.x, base.x)) break;
          points[i] = { x: points[i].x + delta.x, z: points[i].z + delta.z };
        }
      };
      const shiftEnd = (original: Array<{ x: number; z: number }>, points: Array<{ x: number; z: number }>, delta: { x: number; z: number }) => {
        if (!points.length) return;
        const lastIndex = points.length - 1;
        const base = original[lastIndex];
        const axis = original.length > 1 ? axisFrom(original[lastIndex - 1], original[lastIndex]) : null;
        points[lastIndex] = { x: points[lastIndex].x + delta.x, z: points[lastIndex].z + delta.z };
        if (!axis) return;
        for (let i = lastIndex - 1; i >= 0; i -= 1) {
          const p = original[i];
          if (axis === 'x' && !nearlyEqual(p.z, base.z)) break;
          if (axis === 'z' && !nearlyEqual(p.x, base.x)) break;
          points[i] = { x: points[i].x + delta.x, z: points[i].z + delta.z };
        }
      };

      this.connections.update(conns =>
        conns.map(conn => {
          const sourceDelta = movedDeltas.get(conn.sourceId);
          const targetDelta = movedDeltas.get(conn.targetId);
          if (!sourceDelta && !targetDelta) return conn;
          if (!conn.waypoints || conn.waypoints.length < 2) {
            return { ...conn, waypoints: undefined };
          }
          const original = conn.waypoints.map(point => ({ x: point.x, z: point.z }));
          const next = conn.waypoints.map(point => ({ x: point.x, z: point.z }));
          if (sourceDelta && targetDelta && deltasEqual(sourceDelta, targetDelta)) {
            return {
              ...conn,
              waypoints: next.map(point => ({ x: point.x + sourceDelta.x, z: point.z + sourceDelta.z }))
            };
          }
          if (sourceDelta) shiftStart(original, next, sourceDelta);
          if (targetDelta) shiftEnd(original, next, targetDelta);
          return { ...conn, waypoints: next };
        })
      );
    }
  }

  /** Deletes a node together with its nested children, attached boundary events and their flows. */
  public deleteNode(id: string) {
    const node = this.nodeById().get(id);
    if (!node) return;
    this.checkpoint();
    const removed = this.descendantIds(id);
    removed.add(id);
    this.nodes.update(nodes => nodes.filter(n => !removed.has(n.id)));
    this.connections.update(conns => conns.filter(c => !removed.has(c.sourceId) && !removed.has(c.targetId)));
    if (this.selectedNodeId() && removed.has(this.selectedNodeId()!)) this.selectedNodeId.set(null);
    this.selectedNodeIds.update(ids => ids.filter(nodeId => !removed.has(nodeId)));
    if (this.selectedConnectionId()) this.selectedConnectionId.set(null);
    if (this.hoveredNodeId() && removed.has(this.hoveredNodeId()!)) this.hoveredNodeId.set(null);
    if (this.activeContainerId() && removed.has(this.activeContainerId()!)) this.activeContainerId.set(null);
    this.isDirty.set(true);
    const extra = removed.size > 1 ? ` and ${removed.size - 1} nested element(s)` : '';
    this.statusMessage.set(`Deleted ${node.name}${extra}`);
  }

  public deleteConnection(id: string) {
    if (!this.connections().some(c => c.id === id)) return;
    this.checkpoint();
    this.connections.update(conns => conns.filter(c => c.id !== id));
    if (this.selectedConnectionId() === id) this.selectedConnectionId.set(null);
    if (this.hoveredConnectionId() === id) this.hoveredConnectionId.set(null);
    this.isDirty.set(true);
    this.statusMessage.set('Deleted sequence flow');
  }

  public addConnection(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    // Avoid duplicates
    const existing = this.connections().find(c => c.sourceId === sourceId && c.targetId === targetId);
    if (existing) {
      this.statusMessage.set('These elements are already connected.');
      return;
    }

    const byId = this.nodeById();
    const sourceNode = byId.get(sourceId);
    const targetNode = byId.get(targetId);

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
    if (sourceNode.type === 'terminal') {
      this.statusMessage.set('End events cannot have outgoing flows.');
      return;
    }
    if (targetNode.type === 'start' || targetNode.type === 'messageStart') {
      this.statusMessage.set('Start events cannot have incoming flows.');
      return;
    }
    if (targetNode.type === 'boundary') {
      this.statusMessage.set('Boundary events cannot have incoming flows.');
      return;
    }
    if (this.containerOf(sourceNode, byId) !== this.containerOf(targetNode, byId)) {
      this.statusMessage.set('Sequence flows cannot cross a subprocess boundary.');
      return;
    }

    this.checkpoint();
    const id = this.nextConnectionId();
    this.connections.update(conns => [...conns, { id, sourceId, targetId, name: '' }]);
    this.isDirty.set(true);
    this.statusMessage.set(`Connected ${sourceNode.name} → ${targetNode.name}`);
  }

  public updateConnection(id: string, patch: Partial<Pick<Connection, 'name' | 'condition' | 'waypoints'>>) {
    const conn = this.connections().find(c => c.id === id);
    if (!conn) return;
    const changed = (Object.keys(patch) as Array<keyof typeof patch>).some(key => conn[key] !== patch[key]);
    if (!changed) return;
    this.checkpoint();
    this.connections.update(conns => conns.map(c => (c.id === id ? { ...c, ...patch } : c)));
    this.isDirty.set(true);
  }

  // ── Selection ──

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
      this.statusMessage.set(`Selected ${this.nodeById().get(id)?.name ?? id}`);
    } else {
      this.selectOnly(id);
    }
  }

  /** Selects a single node without starting a drag or applying mode-specific behaviour. */
  public selectOnly(id: string) {
    this.selectedConnectionId.set(null);
    this.selectedNodeId.set(id);
    this.selectedNodeIds.set([id]);
    this.statusMessage.set(`Selected ${this.nodeById().get(id)?.name ?? id}`);
  }

  public selectAll() {
    const ids = this.nodes().map(node => node.id);
    this.selectedConnectionId.set(null);
    this.selectedNodeIds.set(ids);
    this.selectedNodeId.set(ids.at(-1) ?? null);
    this.statusMessage.set(`Selected ${ids.length} element(s).`);
  }

  public endDrag() {
    this.draggedNodeId.set(null);
  }

  public selectConnection(id: string) {
    this.selectedNodeId.set(null);
    this.selectedNodeIds.set([]);
    this.selectedConnectionId.set(id);
    this.statusMessage.set('Selected sequence flow');
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
      this.batch(() => selectedNodes.forEach(nodeId => this.deleteNode(nodeId)));
      this.selectedNodeId.set(null);
      this.selectedNodeIds.set([]);
      if (selectedNodes.length > 1) this.statusMessage.set(`Deleted ${selectedNodes.length} elements`);
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

  // ── Properties ──

  private patchNode(id: string, patch: Partial<Node>) {
    const node = this.nodeById().get(id);
    if (!node) return;
    const changed = (Object.keys(patch) as Array<keyof Node>).some(key => node[key] !== patch[key]);
    if (!changed) return;
    this.checkpoint();
    this.nodes.update(nodes => nodes.map(n => (n.id === id ? { ...n, ...patch } : n)));
    this.isDirty.set(true);
  }

  public updateNodeName(id: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;
    this.patchNode(id, { name: nextName });
  }

  public updateNodeDescription(id: string, description: string) {
    this.patchNode(id, { description });
  }

  public updateNodeMultiInstance(id: string, multiInstance: MultiInstanceType) {
    this.patchNode(id, { multiInstance });
  }

  public updateBoundary(id: string, patch: { boundaryKind?: BoundaryKind; cancelActivity?: boolean }) {
    this.patchNode(id, patch);
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
    if (this.nodes().some(node => node.id === nextId) || this.connections().some(conn => conn.id === nextId)) {
      this.statusMessage.set(`ID ${nextId} already exists.`);
      return;
    }
    this.checkpoint();
    const remap = (value: string | null | undefined) => (value === id ? nextId : value);
    this.nodes.set(this.nodes().map(node => ({
      ...node,
      id: node.id === id ? nextId : node.id,
      parentId: remap(node.parentId),
      attachedTo: remap(node.attachedTo)
    })));
    this.connections.set(this.connections().map(conn => ({
      ...conn,
      sourceId: remap(conn.sourceId)!,
      targetId: remap(conn.targetId)!
    })));
    this.isDirty.set(true);

    if (this.selectedNodeId() === id) this.selectedNodeId.set(nextId);
    this.selectedNodeIds.update(ids => ids.map(value => (value === id ? nextId : value)));
    if (this.draggedNodeId() === id) this.draggedNodeId.set(nextId);
    if (this.hoveredNodeId() === id) this.hoveredNodeId.set(nextId);
    if (this.activeContainerId() === id) this.activeContainerId.set(nextId);
    this.statusMessage.set(`Renamed ID to ${nextId}.`);
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
    this.checkpoint();
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
    this.checkpoint();
    this.processName.set(nextName);
    this.isDirty.set(true);
    this.statusMessage.set('Updated process name.');
  }

  // ── Document lifecycle ──

  public newDiagram() {
    this.checkpoint();
    this.nodeCounter = 0;
    this.connectionCounter = 0;
    this.nodes.set([]);
    this.connections.set([]);
    const start = this.createNode('start', new THREE.Vector3(0, 0, 0), null);
    start.name = 'Start';
    this.nodes.set([start]);
    this.processId.set('Process_1');
    this.processName.set('New Process');
    this.resetTransientState();
    this.isDirty.set(false);
    this.lastSavedAt.set(null);
    this.viewRequest.update(v => v + 1);
    this.statusMessage.set('New diagram. Press A to add elements, L to link them.');
  }

  private resetTransientState() {
    this.selectedNodeId.set(null);
    this.selectedNodeIds.set([]);
    this.selectedConnectionId.set(null);
    this.draggedNodeId.set(null);
    this.hoveredNodeId.set(null);
    this.hoveredConnectionId.set(null);
    this.activeContainerId.set(null);
  }

  /** Marks the diagram as saved (e.g. after a file download). */
  public markSaved() {
    this.lastSavedAt.set(Date.now());
    this.isDirty.set(false);
  }

  public requestFrame() {
    this.viewRequest.update(v => v + 1);
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
        boundaryKind: node.boundaryKind ?? null,
        attachedTo: node.attachedTo ?? null,
        cancelActivity: node.cancelActivity ?? null,
        parentId: node.parentId ?? null,
        bounds: node.bounds ?? null,
        position: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z
        }
      })),
      connections: this.connections().map(conn => ({
        id: conn.id,
        sourceId: conn.sourceId,
        targetId: conn.targetId,
        name: conn.name ?? '',
        condition: conn.condition ?? '',
        waypoints: conn.waypoints?.map(point => ({ x: point.x, z: point.z })) ?? null
      }))
    };
    return JSON.stringify(payload, null, 2);
  }

  public saveToLocalStorage(): boolean {
    try {
      localStorage.setItem(QUICK_SAVE_KEY, this.exportDiagramJson());
      this.markSaved();
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
      const raw = localStorage.getItem(QUICK_SAVE_KEY);
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

  /** Silently stores the working diagram so it survives reloads. */
  public persistDraft() {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        diagram: JSON.parse(this.exportDiagramJson()),
        isDirty: this.isDirty(),
        lastSavedAt: this.lastSavedAt()
      }));
    } catch {
      // Storage may be unavailable (private mode, quota); autosave is best effort.
    }
  }

  /** Restores the autosaved diagram, if any. Returns true when a draft was restored. */
  public restoreDraft(): boolean {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    } catch {
      return false;
    }
    if (!raw) return false;
    try {
      const draft = JSON.parse(raw) as { diagram: unknown; isDirty?: boolean; lastSavedAt?: number | null };
      if (!this.importDiagramJson(JSON.stringify(draft.diagram))) return false;
      this.clearHistory();
      this.isDirty.set(!!draft.isDirty);
      this.lastSavedAt.set(draft.lastSavedAt ?? null);
      this.statusMessage.set('Restored your last session.');
      return true;
    } catch {
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
          boundaryKind?: BoundaryKind;
          attachedTo?: string | null;
          cancelActivity?: boolean | null;
          parentId?: string | null;
          bounds?: { width: number; height: number } | null;
          position?: { x: number; y: number; z: number };
        }>;
        connections?: Array<{
          id: string;
          sourceId: string;
          targetId: string;
          name?: string;
          condition?: string;
          waypoints?: Array<{ x: number; z: number }> | null;
        }>;
      };

      if (!data.nodes || !Array.isArray(data.nodes)) {
        this.statusMessage.set('Invalid file: missing nodes.');
        return false;
      }
      if (!data.connections || !Array.isArray(data.connections)) {
        this.statusMessage.set('Invalid file: missing connections.');
        return false;
      }

      const nodes: Node[] = data.nodes
        .filter(node => node && typeof node.id === 'string' && NODE_TYPES.has(node.type))
        .map(node => ({
          id: node.id,
          type: node.type,
          name: node.name ?? `Node ${node.id}`,
          description: node.description ?? '',
          multiInstance: node.multiInstance ?? null,
          boundaryKind: node.boundaryKind ?? null,
          attachedTo: node.attachedTo ?? null,
          cancelActivity: node.cancelActivity ?? null,
          parentId: node.parentId ?? null,
          bounds: node.bounds ?? null,
          position: new THREE.Vector3(
            Number(node.position?.x) || 0,
            Number(node.position?.y) || 0,
            Number(node.position?.z) || 0
          )
        }));

      const idSet = new Set(nodes.map(node => node.id));
      const connections: Connection[] = data.connections
        .filter(conn => idSet.has(conn.sourceId) && idSet.has(conn.targetId))
        .map(conn => ({
          id: conn.id,
          sourceId: conn.sourceId,
          targetId: conn.targetId,
          name: conn.name ?? '',
          condition: conn.condition || undefined,
          waypoints: conn.waypoints?.map(point => ({ x: point.x, z: point.z })) ?? undefined
        }));

      this.checkpoint();
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

      this.resetTransientState();
      this.nodeCounter = this.deriveNodeCounter(nodes);
      this.connectionCounter = this.deriveConnectionCounter(connections);
      this.isDirty.set(false);
      this.viewRequest.update(v => v + 1);
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
      const match = /(?:^|_)(\d+)$/.exec(node.id);
      if (match) {
        const value = Number(match[1]);
        if (value > max) max = value;
      }
    });
    return max;
  }

  private deriveConnectionCounter(connections: Connection[]): number {
    let max = 0;
    connections.forEach(conn => {
      const match = /^Flow_(\d+)/.exec(conn.id);
      if (match) {
        const value = Number(match[1]);
        if (value > max) max = value;
      }
    });
    return max;
  }

  // ── Validation ──

  private validate(nodes: Node[], connections: Connection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const byId = new Map(nodes.map(node => [node.id, node]));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    connections.forEach(conn => {
      outgoing.set(conn.sourceId, (outgoing.get(conn.sourceId) ?? 0) + 1);
      incoming.set(conn.targetId, (incoming.get(conn.targetId) ?? 0) + 1);
    });

    const rootNodes = nodes.filter(node => node.type !== 'boundary' && !node.parentId);
    if (nodes.length > 0 && !rootNodes.some(node => node.type === 'start' || node.type === 'messageStart')) {
      issues.push({ severity: 'error', message: 'The process has no start event.' });
    }
    if (nodes.length > 0 && !rootNodes.some(node => node.type === 'terminal')) {
      issues.push({ severity: 'warning', message: 'The process has no end event.' });
    }

    nodes.forEach(node => {
      const inCount = incoming.get(node.id) ?? 0;
      const outCount = outgoing.get(node.id) ?? 0;
      const label = `“${node.name}”`;

      if (node.type === 'boundary') {
        const host = byId.get(node.attachedTo ?? '');
        if (!host || !BOUNDARY_HOST_TYPES.has(host.type)) {
          issues.push({ severity: 'error', nodeId: node.id, message: `Boundary event ${label} is not attached to a task or subprocess.` });
        }
        if (outCount === 0) {
          issues.push({ severity: 'warning', nodeId: node.id, message: `Boundary event ${label} has no outgoing flow.` });
        }
        return;
      }
      if (node.type === 'start' || node.type === 'messageStart') {
        if (outCount === 0) issues.push({ severity: 'warning', nodeId: node.id, message: `${label} has no outgoing flow.` });
        return;
      }
      if (node.type === 'terminal') {
        if (inCount === 0) issues.push({ severity: 'warning', nodeId: node.id, message: `${label} is never reached.` });
        return;
      }
      if (inCount === 0) issues.push({ severity: 'warning', nodeId: node.id, message: `${label} has no incoming flow.` });
      if (outCount === 0) issues.push({ severity: 'warning', nodeId: node.id, message: `${label} has no outgoing flow.` });
      if ((node.type === 'xgateway' || node.type === 'pgateway') && inCount <= 1 && outCount <= 1 && inCount + outCount > 0) {
        issues.push({ severity: 'warning', nodeId: node.id, message: `Gateway ${label} neither splits nor joins.` });
      }
      if (node.type === 'subprocess' && !nodes.some(child => child.parentId === node.id && child.type !== 'boundary')) {
        issues.push({ severity: 'warning', nodeId: node.id, message: `Subprocess ${label} is empty.` });
      }
    });

    connections.forEach(conn => {
      const source = byId.get(conn.sourceId);
      const target = byId.get(conn.targetId);
      if (source && target && this.containerOf(source, byId) !== this.containerOf(target, byId)) {
        issues.push({
          severity: 'error',
          connectionId: conn.id,
          message: `Flow “${source.name}” → “${target.name}” crosses a subprocess boundary.`
        });
      }
    });
    return issues;
  }

  // ── BPMN export ──

  private diSize(type: NodeType, bounds?: { width: number; height: number } | null): { width: number; height: number } {
    if (type === 'subprocess') {
      return {
        width: Math.round((bounds?.width ?? SUBPROCESS_CONFIG.DEFAULT_WIDTH) * BPMN_DI_CONFIG.SCALE),
        height: Math.round((bounds?.height ?? SUBPROCESS_CONFIG.DEFAULT_DEPTH) * BPMN_DI_CONFIG.SCALE)
      };
    }
    switch (nodeShape(type)) {
      case 'sphere':
        return { width: BPMN_DI_CONFIG.EVENT_SIZE, height: BPMN_DI_CONFIG.EVENT_SIZE };
      case 'diamond':
        return { width: BPMN_DI_CONFIG.GATEWAY_SIZE, height: BPMN_DI_CONFIG.GATEWAY_SIZE };
      default:
        return { width: BPMN_DI_CONFIG.TASK_WIDTH, height: BPMN_DI_CONFIG.TASK_HEIGHT };
    }
  }

  public exportBpmnXml(): string {
    const nodes = this.nodes();
    const connections = this.connections();
    const processId = this.processId();
    const processName = this.processName();
    const S = BPMN_DI_CONFIG.SCALE;
    const byId = new Map(nodes.map(node => [node.id, node]));

    type Bounds = { x: number; y: number; width: number; height: number };
    type Point = { x: number; y: number };

    // 1) Diagram bounds in DI space (3D x → x, 3D z → y)
    const bounds = new Map<string, Bounds>();
    nodes.filter(node => node.type !== 'boundary').forEach(node => {
      const { width, height } = this.diSize(node.type, node.bounds);
      bounds.set(node.id, { x: node.position.x * S - width / 2, y: node.position.z * S - height / 2, width, height });
    });
    nodes.filter(node => node.type === 'boundary').forEach(node => {
      const { width, height } = this.diSize(node.type);
      const host = bounds.get(node.attachedTo ?? '');
      let cx = node.position.x * S;
      let cy = node.position.z * S;
      if (host) {
        // Boundary events sit on the host's border.
        cx = Math.min(Math.max(cx, host.x + width / 2), host.x + host.width - width / 2);
        cy = node.position.z * S < host.y + host.height / 2 ? host.y : host.y + host.height;
      }
      bounds.set(node.id, { x: cx - width / 2, y: cy - height / 2, width, height });
    });

    const allBounds = Array.from(bounds.values());
    const waypointsXY = connections.flatMap(conn => (conn.waypoints ?? []).map(p => ({ x: p.x * S, y: p.z * S })));
    const minX = Math.min(...allBounds.map(b => b.x), ...waypointsXY.map(p => p.x), 0);
    const minY = Math.min(...allBounds.map(b => b.y), ...waypointsXY.map(p => p.y), 0);
    const shiftX = BPMN_DI_CONFIG.MARGIN - minX;
    const shiftY = BPMN_DI_CONFIG.MARGIN - minY;
    bounds.forEach(b => {
      b.x += shiftX;
      b.y += shiftY;
    });

    // 2) Semantic structure
    const childrenOf = new Map<string | null, Node[]>();
    nodes.forEach(node => {
      const container = this.containerOf(node, byId);
      const scope = container && byId.has(container) ? container : null;
      const list = childrenOf.get(scope) ?? [];
      list.push(node);
      childrenOf.set(scope, list);
    });
    const flowsOf = new Map<string | null, Connection[]>();
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    connections.forEach(conn => {
      const source = byId.get(conn.sourceId);
      const target = byId.get(conn.targetId);
      if (!source || !target) return;
      const sourceScope = this.containerOf(source, byId);
      const scope = sourceScope === this.containerOf(target, byId) && sourceScope && byId.has(sourceScope) ? sourceScope : null;
      const list = flowsOf.get(scope) ?? [];
      list.push(conn);
      flowsOf.set(scope, list);
      outgoing.set(conn.sourceId, [...(outgoing.get(conn.sourceId) ?? []), conn.id]);
      incoming.set(conn.targetId, [...(incoming.get(conn.targetId) ?? []), conn.id]);
    });

    const tagForType = (type: NodeType) => {
      switch (type) {
        case 'start':
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
        case 'boundary':
          return 'bpmn:boundaryEvent';
        default:
          return 'bpmn:task';
      }
    };

    const boundaryDefTag = (kind: BoundaryKind | undefined) => {
      switch (kind) {
        case 'message':
          return 'bpmn:messageEventDefinition';
        case 'error':
          return 'bpmn:errorEventDefinition';
        case 'escalation':
          return 'bpmn:escalationEventDefinition';
        default:
          return 'bpmn:timerEventDefinition';
      }
    };

    const nameAttr = (name: string | undefined) => (name?.trim() ? ` name="${escapeXml(name.trim())}"` : '');

    const renderFlow = (conn: Connection, pad: string) => {
      const open = `${pad}<bpmn:sequenceFlow id="${conn.id}"${nameAttr(conn.name)} sourceRef="${conn.sourceId}" targetRef="${conn.targetId}"`;
      if (!conn.condition?.trim()) return `${open} />`;
      return `${open}>\n${pad}  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${escapeXml(conn.condition.trim())}</bpmn:conditionExpression>\n${pad}</bpmn:sequenceFlow>`;
    };

    const renderNode = (node: Node, pad: string): string => {
      const tag = tagForType(node.type);
      let attrs = ` id="${node.id}"${nameAttr(node.name)}`;
      if (node.type === 'boundary') {
        attrs += ` attachedToRef="${node.attachedTo ?? ''}"`;
        if (node.cancelActivity === false) attrs += ' cancelActivity="false"';
      }
      const inner: string[] = [];
      if (node.description?.trim()) {
        inner.push(`${pad}  <bpmn:documentation>${escapeXml(node.description.trim())}</bpmn:documentation>`);
      }
      (incoming.get(node.id) ?? []).forEach(id => inner.push(`${pad}  <bpmn:incoming>${id}</bpmn:incoming>`));
      (outgoing.get(node.id) ?? []).forEach(id => inner.push(`${pad}  <bpmn:outgoing>${id}</bpmn:outgoing>`));
      if (node.multiInstance && (node.type === 'usertask' || node.type === 'servicetask' || node.type === 'subprocess')) {
        inner.push(`${pad}  <bpmn:multiInstanceLoopCharacteristics isSequential="${node.multiInstance === 'sequential'}" />`);
      }
      if (node.type === 'messageStart' || node.type === 'messageCatch') {
        inner.push(`${pad}  <bpmn:messageEventDefinition id="${node.id}_def" />`);
      }
      if (node.type === 'boundary') {
        inner.push(`${pad}  <${boundaryDefTag(node.boundaryKind)} id="${node.id}_def" />`);
      }
      if (node.type === 'subprocess') {
        const body = renderScope(node.id, `${pad}  `);
        if (body) inner.push(body);
      }
      if (!inner.length) return `${pad}<${tag}${attrs} />`;
      return `${pad}<${tag}${attrs}>\n${inner.join('\n')}\n${pad}</${tag}>`;
    };

    const renderScope = (scope: string | null, pad: string): string => {
      const elements = (childrenOf.get(scope) ?? []).map(node => renderNode(node, pad));
      const flows = (flowsOf.get(scope) ?? []).map(conn => renderFlow(conn, pad));
      return [...elements, ...flows].join('\n');
    };

    // 3) Diagram interchange
    const shapeOrder: Node[] = [];
    const visit = (scope: string | null) => {
      const children = childrenOf.get(scope) ?? [];
      children.filter(n => n.type !== 'boundary').forEach(node => {
        shapeOrder.push(node);
        if (node.type === 'subprocess') visit(node.id);
      });
      // Boundary events are drawn after their hosts so they render on top.
      children.filter(n => n.type === 'boundary').forEach(node => shapeOrder.push(node));
    };
    visit(null);

    const shapesXml = shapeOrder.map(node => {
      const b = bounds.get(node.id)!;
      const expanded = node.type === 'subprocess' ? ' isExpanded="true"' : '';
      return `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}"${expanded}>
        <dc:Bounds x="${b.x.toFixed(0)}" y="${b.y.toFixed(0)}" width="${b.width}" height="${b.height}" />
      </bpmndi:BPMNShape>`;
    }).join('\n');

    const isGateway = (node: Node | undefined) => !!node && nodeShape(node.type) === 'diamond';
    const center = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

    const clipToBorder = (b: Bounds, inner: Point, toward: Point): Point => {
      // Endpoints of orthogonal segments: move along the segment axis to the shape border.
      if (Math.abs(toward.y - inner.y) < 0.5) {
        return { x: toward.x >= center(b).x ? b.x + b.width : b.x, y: inner.y };
      }
      return { x: inner.x, y: toward.y >= center(b).y ? b.y + b.height : b.y };
    };

    const autoRoute = (sourceNode: Node | undefined, targetNode: Node | undefined, s: Bounds, t: Bounds): Point[] => {
      const sc = center(s);
      const tc = center(t);
      const dx = tc.x - sc.x;
      const dy = tc.y - sc.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const sx = dx >= 0 ? s.x + s.width : s.x;
        const tx = dx >= 0 ? t.x : t.x + t.width;
        if (Math.abs(dy) < 1) return [{ x: sx, y: sc.y }, { x: tx, y: sc.y }];
        if (isGateway(sourceNode)) {
          // Leave a gateway from its top/bottom corner, then run horizontally into the target.
          return [{ x: sc.x, y: dy > 0 ? s.y + s.height : s.y }, { x: sc.x, y: tc.y }, { x: tx, y: tc.y }];
        }
        if (isGateway(targetNode)) {
          // Run horizontally, then enter a joining gateway from its top/bottom corner.
          return [{ x: sx, y: sc.y }, { x: tc.x, y: sc.y }, { x: tc.x, y: dy > 0 ? t.y : t.y + t.height }];
        }
        const midX = (sx + tx) / 2;
        return [{ x: sx, y: sc.y }, { x: midX, y: sc.y }, { x: midX, y: tc.y }, { x: tx, y: tc.y }];
      }
      const sy = dy >= 0 ? s.y + s.height : s.y;
      const ty = dy >= 0 ? t.y : t.y + t.height;
      if (Math.abs(dx) < 1) return [{ x: sc.x, y: sy }, { x: sc.x, y: ty }];
      const midY = (sy + ty) / 2;
      return [{ x: sc.x, y: sy }, { x: sc.x, y: midY }, { x: tc.x, y: midY }, { x: tc.x, y: ty }];
    };

    const edgesXml = connections.map(conn => {
      const s = bounds.get(conn.sourceId);
      const t = bounds.get(conn.targetId);
      if (!s || !t) return '';
      let points: Point[];
      if (conn.waypoints && conn.waypoints.length >= 2) {
        points = conn.waypoints.map(p => ({ x: p.x * S + shiftX, y: p.z * S + shiftY }));
        points[0] = clipToBorder(s, center(s), points[1]);
        points[points.length - 1] = clipToBorder(t, center(t), points[points.length - 2]);
        if (points.length === 2 && Math.abs(points[0].x - points[1].x) > 0.5 && Math.abs(points[0].y - points[1].y) > 0.5) {
          points = autoRoute(byId.get(conn.sourceId), byId.get(conn.targetId), s, t);
        }
      } else {
        points = autoRoute(byId.get(conn.sourceId), byId.get(conn.targetId), s, t);
      }
      const waypointXml = points
        .map(p => `        <di:waypoint x="${p.x.toFixed(0)}" y="${p.y.toFixed(0)}" />`)
        .join('\n');
      return `      <bpmndi:BPMNEdge id="${conn.id}_di" bpmnElement="${conn.id}">
${waypointXml}
      </bpmndi:BPMNEdge>`;
    }).filter(Boolean).join('\n');

    const processBody = renderScope(null, '    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${processId}"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="SPEAR VRBPMN"
  exporterVersion="1.0">
  <bpmn:process id="${processId}" name="${escapeXml(processName)}" isExecutable="false">
${processBody}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${shapesXml}
${edgesXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
  }

  // ── BPMN import ──

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
          bpmn: BPMN_NS,
          bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
          dc: DC_NS,
          di: DI_NS
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

      const processEls = selectAll('//bpmn:process');
      if (!processEls.length) {
        this.statusMessage.set('No BPMN process found in file.');
        return false;
      }
      const processEl = processEls[0];
      const pid = processEl.getAttribute('id');
      const pname = processEl.getAttribute('name')
        ?? selectAll('//bpmn:participant').find(p => p.getAttribute('processRef') === pid)?.getAttribute('name')
        ?? null;

      const shapes = selectAll('//bpmndi:BPMNShape');
      const boundsById = new Map<string, { x: number; y: number; w: number; h: number }>();
      shapes.forEach(shape => {
        const bpmnElement = shape.getAttribute('bpmnElement');
        const bounds = shape.getElementsByTagNameNS(DC_NS, 'Bounds')[0];
        if (!bpmnElement || !bounds) return;
        const x = Number(bounds.getAttribute('x') ?? '0');
        const y = Number(bounds.getAttribute('y') ?? '0');
        const w = Number(bounds.getAttribute('width') ?? '0');
        const h = Number(bounds.getAttribute('height') ?? '0');
        boundsById.set(bpmnElement, { x, y, w, h });
      });

      const nodes: Node[] = [];
      const scale = BPMN_DI_CONFIG.SCALE;

      const directChild = (el: Element, localName: string) =>
        Array.from(el.children).find(child => child.namespaceURI === BPMN_NS && child.localName === localName);

      const parseMultiInstance = (el: Element): MultiInstanceType => {
        const mi = directChild(el, 'multiInstanceLoopCharacteristics');
        if (!mi) return null;
        const isSeq = mi.getAttribute('isSequential') === 'true';
        return isSeq ? 'sequential' : 'parallel';
      };

      const parseBoundaryKind = (el: Element): BoundaryKind => {
        if (directChild(el, 'timerEventDefinition')) return 'timer';
        if (directChild(el, 'messageEventDefinition')) return 'message';
        if (directChild(el, 'errorEventDefinition')) return 'error';
        if (directChild(el, 'escalationEventDefinition')) return 'escalation';
        return 'timer';
      };

      const hasMessageDef = (el: Element) => !!directChild(el, 'messageEventDefinition');

      const typeForElement = (el: Element): NodeType | null => {
        switch (el.localName) {
          case 'startEvent':
            return hasMessageDef(el) ? 'messageStart' : 'start';
          case 'endEvent':
            return 'terminal';
          case 'userTask':
          case 'receiveTask':
          case 'manualTask':
            return 'usertask';
          case 'serviceTask':
          case 'scriptTask':
          case 'sendTask':
          case 'businessRuleTask':
            return 'servicetask';
          case 'task': {
            const taskType = el.getAttribute('type') ?? el.getAttribute('taskType') ?? '';
            return taskType.toLowerCase().includes('service') ? 'servicetask' : 'usertask';
          }
          case 'callActivity':
            return 'servicetask';
          case 'exclusiveGateway':
            return 'xgateway';
          case 'parallelGateway':
          case 'inclusiveGateway':
          case 'complexGateway':
            return 'pgateway';
          case 'eventBasedGateway':
            return 'eventgateway';
          case 'subProcess':
          case 'transaction':
          case 'adHocSubProcess':
            return 'subprocess';
          case 'intermediateThrowEvent':
          case 'intermediateCatchEvent':
            return 'messageCatch';
          case 'boundaryEvent':
            return 'boundary';
          default:
            return null;
        }
      };

      const createNode = (el: Element, parentId: string | null): Node | null => {
        const id = el.getAttribute('id');
        const type = typeForElement(el);
        if (!id || !type) return null;

        const bounds = boundsById.get(id);
        const centerX = bounds ? bounds.x + bounds.w / 2 : 0;
        const centerY = bounds ? bounds.y + bounds.h / 2 : 0;
        const attachedTo = type === 'boundary' ? el.getAttribute('attachedToRef') : null;
        const documentation = directChild(el, 'documentation')?.textContent?.trim() ?? '';

        return {
          id,
          type,
          name: el.getAttribute('name') ?? '',
          description: documentation,
          multiInstance: parseMultiInstance(el),
          boundaryKind: type === 'boundary' ? parseBoundaryKind(el) : null,
          attachedTo,
          cancelActivity: type === 'boundary' ? el.getAttribute('cancelActivity') !== 'false' : null,
          position: new THREE.Vector3(centerX / scale, 0, centerY / scale),
          parentId: type === 'boundary' ? attachedTo : parentId,
          bounds: type === 'subprocess' && bounds ? { width: bounds.w / scale, height: bounds.h / scale } : null
        };
      };

      const walk = (container: Element, parentId: string | null) => {
        Array.from(container.children).forEach(el => {
          if (el.namespaceURI !== BPMN_NS) return;
          const node = createNode(el, parentId);
          if (!node) return;
          if (!node.name) node.name = `${NODE_TYPE_META[node.type].label}`;
          nodes.push(node);
          if (node.type === 'subprocess') walk(el, node.id);
        });
      };
      processEls.forEach(processElement => walk(processElement, null));

      const edgeWaypoints = new Map<string, Array<{ x: number; z: number }>>();
      const edges = selectAll('//bpmndi:BPMNEdge');
      edges.forEach(edge => {
        const flowId = edge.getAttribute('bpmnElement');
        if (!flowId) return;
        const waypointEls = edge.getElementsByTagNameNS(DI_NS, 'waypoint');
        const points: Array<{ x: number; z: number }> = [];
        Array.from(waypointEls).forEach(waypoint => {
          const xAttr = waypoint.getAttribute('x');
          const yAttr = waypoint.getAttribute('y');
          if (xAttr === null || yAttr === null) return;
          const rawX = Number(xAttr);
          const rawY = Number(yAttr);
          if (Number.isNaN(rawX) || Number.isNaN(rawY)) return;
          points.push({ x: rawX / scale, z: rawY / scale });
        });
        if (points.length >= 2) {
          edgeWaypoints.set(flowId, points);
        }
      });

      const flows = selectAll('//bpmn:sequenceFlow');
      const idSet = new Set(nodes.map(n => n.id));
      const connections: Connection[] = flows
        .map(flow => ({
          id: flow.getAttribute('id') || `Flow_${flow.getAttribute('sourceRef')}_${flow.getAttribute('targetRef')}`,
          sourceId: flow.getAttribute('sourceRef') || '',
          targetId: flow.getAttribute('targetRef') || '',
          name: flow.getAttribute('name') ?? '',
          condition: directChild(flow, 'conditionExpression')?.textContent?.trim() || undefined,
          waypoints: edgeWaypoints.get(flow.getAttribute('id') || '') ?? undefined
        }))
        .filter(conn => idSet.has(conn.sourceId) && idSet.has(conn.targetId));

      // Recenter positions around origin to keep nodes in view
      let centerX = 0;
      let centerZ = 0;
      if (nodes.length) {
        const minX = Math.min(...nodes.map(n => n.position.x));
        const maxX = Math.max(...nodes.map(n => n.position.x));
        const minZ = Math.min(...nodes.map(n => n.position.z));
        const maxZ = Math.max(...nodes.map(n => n.position.z));
        centerX = (minX + maxX) / 2;
        centerZ = (minZ + maxZ) / 2;
        nodes.forEach(n => {
          n.position.x -= centerX;
          n.position.z -= centerZ;
        });
      }

      if (centerX !== 0 || centerZ !== 0) {
        connections.forEach(conn => {
          if (!conn.waypoints) return;
          conn.waypoints = conn.waypoints.map(point => ({
            x: point.x - centerX,
            z: point.z - centerZ
          }));
        });
      }

      this.adjustSubprocessBounds(nodes);

      this.checkpoint();
      if (pid && this.isValidXmlId(pid)) this.processId.set(pid);
      if (pname?.trim()) this.processName.set(pname.trim());
      this.nodes.set(nodes);
      this.connections.set(connections);
      this.resetTransientState();
      this.nodeCounter = this.deriveNodeCounter(nodes);
      this.connectionCounter = this.deriveConnectionCounter(connections);
      this.isDirty.set(false);
      this.viewRequest.update(v => v + 1);
      this.statusMessage.set(`Imported BPMN XML (${nodes.length} elements, ${connections.length} flows).`);
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

  /** Gives subprocesses without diagram bounds a size that encloses their children. */
  private adjustSubprocessBounds(nodes: Node[]) {
    const childrenByParent = new Map<string, Node[]>();
    nodes.forEach(node => {
      if (!node.parentId || node.type === 'boundary') return;
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    });

    const padding = SUBPROCESS_CONFIG.PADDING;
    nodes.forEach(node => {
      if (node.type !== 'subprocess' || node.bounds) return;
      const children = childrenByParent.get(node.id) ?? [];
      if (!children.length) return;

      let maxX = 0;
      let maxZ = 0;
      children.forEach(child => {
        const { halfW, halfD } = nodeHalfExtents(child.type, child.bounds);
        maxX = Math.max(maxX, Math.abs(child.position.x - node.position.x) + halfW);
        maxZ = Math.max(maxZ, Math.abs(child.position.z - node.position.z) + halfD);
      });

      node.bounds = {
        width: Math.max(2 * maxX + padding * 2, SUBPROCESS_CONFIG.MIN_SIZE),
        height: Math.max(2 * maxZ + padding * 2, SUBPROCESS_CONFIG.MIN_SIZE)
      };
    });
  }
}
