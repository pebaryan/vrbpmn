import { Injectable, signal, computed } from '@angular/core';
import * as THREE from 'three';

export type NodeType = 'start' | 'usertask' | 'servicetask' | 'xgateway' | 'pgateway' | 'terminal';
export type InteractionMode = 'move' | 'add' | 'link' | 'delete';

export interface Node {
  id: string;
  type: NodeType;
  position: THREE.Vector3;
  name: string;
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

  public interactionMode = signal<InteractionMode>('move');
  public currentNodeType = signal<NodeType>('usertask');
  public selectedNodeId = signal<string | null>(null);
  public draggedNodeId = signal<string | null>(null);
  public hoveredNodeId = signal<string | null>(null);
  public hoveredConnectionId = signal<string | null>(null);
  public showModal = signal<boolean>(false);
  public statusMessage = signal<string>('System Ready');

  public hoverNode(id: string | null, isHovered: boolean) {
    this.hoveredNodeId.set(isHovered ? id : null);
  }

  public hoverConnection(id: string | null, isHovered: boolean) {
    this.hoveredConnectionId.set(isHovered ? id : null);
  }

  public readonly allNodes = computed(() => this.nodes());
  public readonly allConnections = computed(() => this.connections());

  private nodeCounter = 0;

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
        name: `Node ${id}`
      };
      this.nodes.update(nodes => [...nodes, node]);

      if (i > 0) {
        const prevNode = this.nodes()[this.nodes().length - 2];
        this.addConnection(prevNode.id, node.id);
      }
    });
  }

  private getNextId(): string {
    return (++this.nodeCounter).toString();
  }

  public setMode(mode: InteractionMode) {
    this.interactionMode.set(mode);
    this.statusMessage.set(`Mode: ${mode.toUpperCase()}`);
    if (mode !== 'link') {
      this.selectedNodeId.set(null);
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
      name: `Node ${id}`
    };
    this.nodes.update(nodes => [...nodes, newNode]);
    this.statusMessage.set(`Added ${type} at ${position.x.toFixed(1)}, ${position.z.toFixed(1)}`);
  }

  public moveNode(id: string, position: THREE.Vector3) {
    // Optimized: Mutate position directly instead of creating new array
    const node = this.nodes().find(n => n.id === id);
    if (node) {
      node.position.copy(position);
      // Trigger reactivity with a shallow update
      this.nodes.set([...this.nodes()]);
    }
  }

  public deleteNode(id: string) {
    this.nodes.update(nodes => nodes.filter(n => n.id !== id));
    this.connections.update(conns => conns.filter(c => c.sourceId !== id && c.targetId !== id));
    this.statusMessage.set(`Deleted Node ${id}`);
  }

  public deleteConnection(id: string) {
    this.connections.update(conns => conns.filter(c => c.id !== id));
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
    if (targetNode.type === 'start') {
      this.statusMessage.set('Start node cannot have incoming connections');
      return;
    }
    if (sourceNode.type === 'terminal') {
      this.statusMessage.set('Terminal node cannot have outgoing connections');
      return;
    }

    const id = `conn-${sourceId}-${targetId}`;
    this.connections.update(conns => [...conns, { id, sourceId, targetId }]);
    this.statusMessage.set(`Connected ${sourceId} to ${targetId}`);
  }

  public selectNode(id: string) {
    if (this.interactionMode() === 'link') {
      const sourceId = this.selectedNodeId();
      if (!sourceId) {
        this.selectedNodeId.set(id);
        this.statusMessage.set('Source node selected. Click target node.');
      } else if (sourceId === id) {
        this.selectedNodeId.set(null);
        this.statusMessage.set('Deselected source node.');
      } else {
        this.addConnection(sourceId, id);
        this.selectedNodeId.set(null);
      }
    } else if (this.interactionMode() === 'delete') {
      this.deleteNode(id);
    } else if (this.interactionMode() === 'move') {
      this.selectedNodeId.set(id);
      this.draggedNodeId.set(id);
      this.statusMessage.set(`Dragging Node ${id}`);
    } else {
      this.selectedNodeId.set(id);
      this.statusMessage.set(`Selected Node ${id}`);
    }
  }

  public endDrag() {
    this.draggedNodeId.set(null);
  }

  public openModal() {
    if (this.selectedNodeId()) {
      this.showModal.set(true);
    }
  }

  public closeModal() {
    this.showModal.set(false);
  }
}
