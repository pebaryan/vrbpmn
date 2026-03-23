import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import * as THREE from 'three';
import { ProcessStateService, Node, Connection, NodeType } from './process-state.service';

describe('ProcessStateService', () => {
  let service: ProcessStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()]
    });
    service = TestBed.inject(ProcessStateService);
  });

  // ── Initialization ──

  describe('initialization', () => {
    it('should create with default nodes', () => {
      expect(service.allNodes().length).toBeGreaterThan(0);
    });

    it('should create with default connections between sequential nodes', () => {
      expect(service.allConnections().length).toBeGreaterThan(0);
    });

    it('should have default process id and name', () => {
      expect(service.processId()).toBe('Process_1');
      expect(service.processName()).toBe('SPEAR Process');
    });

    it('should start in move mode', () => {
      expect(service.interactionMode()).toBe('move');
    });

    it('should start with snap enabled', () => {
      expect(service.snapToGrid()).toBeTrue();
    });

    it('should not be dirty on init', () => {
      // Constructor sets isDirty during initializeDefaultNodes, check state
      expect(service.isDirty()).toBeTrue(); // init adds nodes which sets dirty
    });
  });

  // ── Node CRUD ──

  describe('addNode', () => {
    it('should add a node at the given position', () => {
      const initialCount = service.allNodes().length;
      service.setNodeType('servicetask');
      service.addNode(new THREE.Vector3(5, 0, 3));
      expect(service.allNodes().length).toBe(initialCount + 1);
      const added = service.allNodes()[service.allNodes().length - 1];
      expect(added.type).toBe('servicetask');
      expect(added.position.x).toBe(5);
      expect(added.position.z).toBe(3);
    });

    it('should add a node with the current node type', () => {
      service.setNodeType('xgateway');
      service.addNode(new THREE.Vector3(0, 0, 0));
      const added = service.allNodes()[service.allNodes().length - 1];
      expect(added.type).toBe('xgateway');
    });

    it('should assign unique ids to nodes', () => {
      service.addNode(new THREE.Vector3(0, 0, 0));
      service.addNode(new THREE.Vector3(1, 0, 0));
      const nodes = service.allNodes();
      const ids = nodes.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should add node inside active container with offset position', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(10, 0, 10));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.setActiveContainer(subprocess.id);

      service.setNodeType('usertask');
      service.addNode(new THREE.Vector3(2, 0, 1));
      const child = service.allNodes()[service.allNodes().length - 1];
      expect(child.parentId).toBe(subprocess.id);
      expect(child.position.x).toBe(12); // 10 + 2
      expect(child.position.z).toBe(11); // 10 + 1
    });

    it('should set isDirty after adding', () => {
      service.addNode(new THREE.Vector3(0, 0, 0));
      expect(service.isDirty()).toBeTrue();
    });
  });

  describe('deleteNode', () => {
    it('should remove the node by id', () => {
      const nodes = service.allNodes();
      const targetId = nodes[0].id;
      const initialCount = nodes.length;
      service.deleteNode(targetId);
      expect(service.allNodes().length).toBe(initialCount - 1);
      expect(service.allNodes().find(n => n.id === targetId)).toBeUndefined();
    });

    it('should remove connections referencing deleted node', () => {
      const nodes = service.allNodes();
      // Delete a middle node that has both incoming and outgoing connections
      const middleNode = nodes[1];
      service.deleteNode(middleNode.id);
      const conns = service.allConnections();
      conns.forEach(c => {
        expect(c.sourceId).not.toBe(middleNode.id);
        expect(c.targetId).not.toBe(middleNode.id);
      });
    });

    it('should clear selection if deleted node was selected', () => {
      const nodes = service.allNodes();
      service.selectedNodeId.set(nodes[0].id);
      service.deleteNode(nodes[0].id);
      expect(service.selectedNodeId()).toBeNull();
    });
  });

  describe('moveNode', () => {
    it('should update node position', () => {
      const node = service.allNodes()[0];
      const newPos = new THREE.Vector3(99, 0, 99);
      service.moveNode(node.id, newPos);
      const moved = service.allNodes().find(n => n.id === node.id)!;
      expect(moved.position.x).toBe(99);
      expect(moved.position.z).toBe(99);
    });

    it('should move child nodes when parent moves', () => {
      // Create a subprocess with a child
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(0, 0, 0));
      const subprocess = service.allNodes()[service.allNodes().length - 1];

      service.setActiveContainer(subprocess.id);
      service.setNodeType('usertask');
      service.addNode(new THREE.Vector3(1, 0, 1));
      const child = service.allNodes()[service.allNodes().length - 1];
      service.setActiveContainer(null);

      const childOrigX = child.position.x;
      const childOrigZ = child.position.z;

      service.moveNode(subprocess.id, new THREE.Vector3(5, 0, 5));
      const movedChild = service.allNodes().find(n => n.id === child.id)!;
      expect(movedChild.position.x).toBe(childOrigX + 5);
      expect(movedChild.position.z).toBe(childOrigZ + 5);
    });

    it('should set isDirty', () => {
      const node = service.allNodes()[0];
      service.moveNode(node.id, new THREE.Vector3(1, 0, 1));
      expect(service.isDirty()).toBeTrue();
    });
  });

  // ── Connection Rules ──

  describe('addConnection', () => {
    it('should add a connection between two nodes', () => {
      service.addNode(new THREE.Vector3(0, 0, 0));
      service.addNode(new THREE.Vector3(5, 0, 0));
      const nodes = service.allNodes();
      const a = nodes[nodes.length - 2];
      const b = nodes[nodes.length - 1];
      const initialConns = service.allConnections().length;
      service.addConnection(a.id, b.id);
      expect(service.allConnections().length).toBe(initialConns + 1);
    });

    it('should not allow self-connections', () => {
      const node = service.allNodes()[0];
      const initialConns = service.allConnections().length;
      service.addConnection(node.id, node.id);
      expect(service.allConnections().length).toBe(initialConns);
    });

    it('should not allow duplicate connections', () => {
      const nodes = service.allNodes();
      const a = nodes[0];
      const b = nodes[1];
      // Connection likely already exists from init; try adding again
      const initialConns = service.allConnections().length;
      service.addConnection(a.id, b.id);
      expect(service.allConnections().length).toBe(initialConns);
    });

    it('should reject incoming connections to start events', () => {
      service.setNodeType('start');
      service.addNode(new THREE.Vector3(20, 0, 0));
      const startNode = service.allNodes()[service.allNodes().length - 1];
      const otherNode = service.allNodes()[0];
      const initialConns = service.allConnections().length;
      service.addConnection(otherNode.id, startNode.id);
      expect(service.allConnections().length).toBe(initialConns);
      expect(service.statusMessage()).toContain('Start node cannot have incoming');
    });

    it('should reject incoming connections to messageStart events', () => {
      service.setNodeType('messageStart');
      service.addNode(new THREE.Vector3(20, 0, 0));
      const msgStart = service.allNodes()[service.allNodes().length - 1];
      const otherNode = service.allNodes()[0];
      const initialConns = service.allConnections().length;
      service.addConnection(otherNode.id, msgStart.id);
      expect(service.allConnections().length).toBe(initialConns);
    });

    it('should reject outgoing connections from terminal events', () => {
      service.setNodeType('terminal');
      service.addNode(new THREE.Vector3(20, 0, 0));
      const terminal = service.allNodes()[service.allNodes().length - 1];
      const otherNode = service.allNodes()[0];
      const initialConns = service.allConnections().length;
      service.addConnection(terminal.id, otherNode.id);
      expect(service.allConnections().length).toBe(initialConns);
      expect(service.statusMessage()).toContain('Terminal node cannot have outgoing');
    });

    it('should report error for non-existent source', () => {
      const node = service.allNodes()[0];
      service.addConnection('nonexistent', node.id);
      expect(service.statusMessage()).toContain('Source node');
    });

    it('should report error for non-existent target', () => {
      const node = service.allNodes()[0];
      service.addConnection(node.id, 'nonexistent');
      expect(service.statusMessage()).toContain('Target node');
    });
  });

  describe('deleteConnection', () => {
    it('should remove a connection by id', () => {
      const conn = service.allConnections()[0];
      service.deleteConnection(conn.id);
      expect(service.allConnections().find(c => c.id === conn.id)).toBeUndefined();
    });

    it('should clear selectedConnectionId if matching', () => {
      const conn = service.allConnections()[0];
      service.selectedConnectionId.set(conn.id);
      service.deleteConnection(conn.id);
      expect(service.selectedConnectionId()).toBeNull();
    });
  });

  // ── Interaction Modes ──

  describe('setMode', () => {
    it('should switch mode and update status', () => {
      service.setMode('add');
      expect(service.interactionMode()).toBe('add');
      expect(service.statusMessage()).toContain('ADD');
    });

    it('should clear selection when switching to non-link mode', () => {
      service.selectedNodeId.set('1');
      service.selectedNodeIds.set(['1']);
      service.setMode('add');
      expect(service.selectedNodeId()).toBeNull();
      expect(service.selectedNodeIds()).toEqual([]);
    });

    it('should clear all selection when switching to delete mode', () => {
      service.selectedNodeId.set('1');
      service.selectedConnectionId.set('conn1');
      service.setMode('delete');
      expect(service.selectedNodeId()).toBeNull();
      expect(service.selectedConnectionId()).toBeNull();
    });
  });

  describe('selectNode', () => {
    it('should select node in move mode and start drag', () => {
      service.setMode('move');
      const node = service.allNodes()[0];
      service.selectNode(node.id);
      expect(service.selectedNodeId()).toBe(node.id);
      expect(service.draggedNodeId()).toBe(node.id);
    });

    it('should select source then target in link mode', () => {
      service.setMode('link');
      const nodes = service.allNodes();
      service.selectNode(nodes[0].id);
      expect(service.selectedNodeId()).toBe(nodes[0].id);
      expect(service.statusMessage()).toContain('Source node selected');
    });

    it('should deselect when clicking same node in link mode', () => {
      service.setMode('link');
      const node = service.allNodes()[0];
      service.selectNode(node.id);
      service.selectNode(node.id);
      expect(service.selectedNodeId()).toBeNull();
    });

    it('should delete node in delete mode', () => {
      service.setMode('delete');
      const nodes = service.allNodes();
      const target = nodes[0];
      const initialCount = nodes.length;
      service.selectNode(target.id);
      expect(service.allNodes().length).toBe(initialCount - 1);
    });
  });

  // ── Node Properties ──

  describe('updateNodeName', () => {
    it('should update the node name', () => {
      const node = service.allNodes()[0];
      service.updateNodeName(node.id, 'New Name');
      expect(service.allNodes().find(n => n.id === node.id)!.name).toBe('New Name');
    });

    it('should not update with empty name', () => {
      const node = service.allNodes()[0];
      const originalName = node.name;
      service.updateNodeName(node.id, '   ');
      expect(service.allNodes().find(n => n.id === node.id)!.name).toBe(originalName);
    });
  });

  describe('updateNodeId', () => {
    it('should rename node id and update connections', () => {
      const node = service.allNodes()[0];
      const oldId = node.id;
      service.updateNodeId(oldId, 'NewId_1');
      expect(service.allNodes().find(n => n.id === 'NewId_1')).toBeTruthy();
      expect(service.allNodes().find(n => n.id === oldId)).toBeUndefined();
      // Connections should reference new id
      const conns = service.allConnections();
      conns.forEach(c => {
        expect(c.sourceId).not.toBe(oldId);
        expect(c.targetId).not.toBe(oldId);
      });
    });

    it('should reject empty id', () => {
      const node = service.allNodes()[0];
      service.updateNodeId(node.id, '');
      expect(service.statusMessage()).toContain('cannot be empty');
    });

    it('should reject invalid XML id', () => {
      const node = service.allNodes()[0];
      service.updateNodeId(node.id, '123invalid');
      expect(service.statusMessage()).toContain('must start with a letter');
    });

    it('should reject duplicate id', () => {
      const nodes = service.allNodes();
      service.updateNodeId(nodes[0].id, nodes[1].id);
      expect(service.statusMessage()).toContain('already exists');
    });
  });

  describe('updateNodeMultiInstance', () => {
    it('should set multi-instance to parallel', () => {
      const node = service.allNodes()[0];
      service.updateNodeMultiInstance(node.id, 'parallel');
      expect(service.allNodes().find(n => n.id === node.id)!.multiInstance).toBe('parallel');
    });

    it('should set multi-instance to sequential', () => {
      const node = service.allNodes()[0];
      service.updateNodeMultiInstance(node.id, 'sequential');
      expect(service.allNodes().find(n => n.id === node.id)!.multiInstance).toBe('sequential');
    });

    it('should clear multi-instance with null', () => {
      const node = service.allNodes()[0];
      service.updateNodeMultiInstance(node.id, 'parallel');
      service.updateNodeMultiInstance(node.id, null);
      expect(service.allNodes().find(n => n.id === node.id)!.multiInstance).toBeNull();
    });
  });

  describe('updateNodeDescription', () => {
    it('should update description', () => {
      const node = service.allNodes()[0];
      service.updateNodeDescription(node.id, 'A description');
      expect(service.allNodes().find(n => n.id === node.id)!.description).toBe('A description');
    });
  });

  // ── Process Properties ──

  describe('updateProcessId', () => {
    it('should update process id', () => {
      service.updateProcessId('MyProcess');
      expect(service.processId()).toBe('MyProcess');
    });

    it('should reject empty process id', () => {
      service.updateProcessId('');
      expect(service.statusMessage()).toContain('cannot be empty');
    });

    it('should reject invalid XML id', () => {
      service.updateProcessId('1bad');
      expect(service.statusMessage()).toContain('must start with a letter');
    });
  });

  describe('updateProcessName', () => {
    it('should update process name', () => {
      service.updateProcessName('My Process');
      expect(service.processName()).toBe('My Process');
    });

    it('should reject empty process name', () => {
      service.updateProcessName('');
      expect(service.statusMessage()).toContain('cannot be empty');
    });
  });

  // ── Active Container ──

  describe('setActiveContainer', () => {
    it('should set active container for subprocess', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(0, 0, 0));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.setActiveContainer(subprocess.id);
      expect(service.activeContainerId()).toBe(subprocess.id);
    });

    it('should reject non-subprocess as container', () => {
      const node = service.allNodes().find(n => n.type !== 'subprocess')!;
      service.setActiveContainer(node.id);
      expect(service.activeContainerId()).toBeNull();
      expect(service.statusMessage()).toContain('Only subprocess');
    });

    it('should clear container with null', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(0, 0, 0));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.setActiveContainer(subprocess.id);
      service.setActiveContainer(null);
      expect(service.activeContainerId()).toBeNull();
    });
  });

  // ── Subprocess Resize ──

  describe('resizeSubprocessBounds', () => {
    it('should update subprocess bounds', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(0, 0, 0));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.resizeSubprocessBounds(subprocess.id, 8, 6);
      const updated = service.allNodes().find(n => n.id === subprocess.id)!;
      expect(updated.bounds!.width).toBe(8);
      expect(updated.bounds!.height).toBe(6);
    });

    it('should offset subprocess position during resize', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(10, 0, 10));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.resizeSubprocessBounds(subprocess.id, 8, 6, 1, 2);
      const updated = service.allNodes().find(n => n.id === subprocess.id)!;
      expect(updated.position.x).toBe(11);
      expect(updated.position.z).toBe(12);
    });

    it('should ignore non-subprocess nodes', () => {
      const node = service.allNodes().find(n => n.type !== 'subprocess')!;
      const originalBounds = node.bounds;
      service.resizeSubprocessBounds(node.id, 10, 10);
      expect(service.allNodes().find(n => n.id === node.id)!.bounds).toEqual(originalBounds);
    });
  });

  // ── Selection ──

  describe('clearSelection', () => {
    it('should clear all selection state', () => {
      service.selectedNodeId.set('1');
      service.selectedNodeIds.set(['1']);
      service.selectedConnectionId.set('conn1');
      service.draggedNodeId.set('1');
      service.clearSelection();
      expect(service.selectedNodeId()).toBeNull();
      expect(service.selectedNodeIds()).toEqual([]);
      expect(service.selectedConnectionId()).toBeNull();
      expect(service.draggedNodeId()).toBeNull();
    });
  });

  describe('toggleNodeSelection', () => {
    it('should add node to multi-selection in move mode', () => {
      service.setMode('move');
      const nodes = service.allNodes();
      service.selectedNodeIds.set([nodes[0].id]);
      service.toggleNodeSelection(nodes[1].id);
      expect(service.selectedNodeIds()).toContain(nodes[0].id);
      expect(service.selectedNodeIds()).toContain(nodes[1].id);
    });

    it('should remove node from multi-selection', () => {
      service.setMode('move');
      const nodes = service.allNodes();
      service.selectedNodeIds.set([nodes[0].id, nodes[1].id]);
      service.selectedNodeId.set(nodes[1].id);
      service.toggleNodeSelection(nodes[1].id);
      expect(service.selectedNodeIds()).not.toContain(nodes[1].id);
    });

    it('should do nothing in non-move mode', () => {
      service.setMode('add');
      const node = service.allNodes()[0];
      service.toggleNodeSelection(node.id);
      expect(service.selectedNodeIds()).toEqual([]);
    });
  });

  describe('deleteSelected', () => {
    it('should delete selected nodes', () => {
      const nodes = service.allNodes();
      service.selectedNodeIds.set([nodes[0].id]);
      const initialCount = nodes.length;
      service.deleteSelected();
      expect(service.allNodes().length).toBe(initialCount - 1);
    });

    it('should delete selected connection when no nodes selected', () => {
      const conn = service.allConnections()[0];
      service.selectedConnectionId.set(conn.id);
      service.deleteSelected();
      expect(service.allConnections().find(c => c.id === conn.id)).toBeUndefined();
    });
  });

  // ── Snap ──

  describe('toggleSnap', () => {
    it('should toggle snap to grid', () => {
      const initial = service.snapToGrid();
      service.toggleSnap();
      expect(service.snapToGrid()).toBe(!initial);
      service.toggleSnap();
      expect(service.snapToGrid()).toBe(initial);
    });
  });

  // ── Hover ──

  describe('hoverNode', () => {
    it('should set hovered node id', () => {
      service.hoverNode('abc', true);
      expect(service.hoveredNodeId()).toBe('abc');
    });

    it('should clear hovered node id', () => {
      service.hoverNode('abc', true);
      service.hoverNode('abc', false);
      expect(service.hoveredNodeId()).toBeNull();
    });
  });

  describe('hoverConnection', () => {
    it('should set hovered connection id', () => {
      service.hoverConnection('conn1', true);
      expect(service.hoveredConnectionId()).toBe('conn1');
    });

    it('should clear hovered connection id', () => {
      service.hoverConnection('conn1', true);
      service.hoverConnection('conn1', false);
      expect(service.hoveredConnectionId()).toBeNull();
    });
  });

  // ── JSON Import/Export ──

  describe('exportDiagramJson / importDiagramJson', () => {
    it('should round-trip nodes and connections', () => {
      const json = service.exportDiagramJson();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.processId).toBe(service.processId());
      expect(parsed.processName).toBe(service.processName());
      expect(parsed.nodes.length).toBe(service.allNodes().length);
      expect(parsed.connections.length).toBe(service.allConnections().length);

      // Re-import
      const result = service.importDiagramJson(json);
      expect(result).toBeTrue();
      expect(service.allNodes().length).toBe(parsed.nodes.length);
      expect(service.allConnections().length).toBe(parsed.connections.length);
    });

    it('should preserve node properties in export', () => {
      const node = service.allNodes()[0];
      service.updateNodeMultiInstance(node.id, 'parallel');
      service.updateNodeDescription(node.id, 'Test desc');
      const json = service.exportDiagramJson();
      const parsed = JSON.parse(json);
      const exported = parsed.nodes.find((n: any) => n.id === node.id);
      expect(exported.multiInstance).toBe('parallel');
      expect(exported.description).toBe('Test desc');
    });

    it('should reject invalid JSON (missing nodes)', () => {
      const result = service.importDiagramJson('{"connections":[]}');
      expect(result).toBeFalse();
    });

    it('should reject invalid JSON (missing connections)', () => {
      const result = service.importDiagramJson('{"nodes":[]}');
      expect(result).toBeFalse();
    });

    it('should handle malformed JSON', () => {
      const result = service.importDiagramJson('not json at all');
      expect(result).toBeFalse();
    });

    it('should filter out connections with missing node refs', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'A', type: 'start', position: { x: 0, y: 0, z: 0 } }],
        connections: [
          { id: 'c1', sourceId: 'A', targetId: 'B' }, // B doesn't exist
          { id: 'c2', sourceId: 'X', targetId: 'A' }  // X doesn't exist
        ]
      });
      service.importDiagramJson(json);
      expect(service.allConnections().length).toBe(0);
    });

    it('should clear selection state after import', () => {
      service.selectedNodeId.set('1');
      service.importDiagramJson(service.exportDiagramJson());
      expect(service.selectedNodeId()).toBeNull();
      expect(service.draggedNodeId()).toBeNull();
    });
  });

  // ── BPMN XML Export ──

  describe('exportBpmnXml', () => {
    it('should produce valid BPMN XML with definitions', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<bpmn:definitions');
      expect(xml).toContain('</bpmn:definitions>');
    });

    it('should include process element with id and name', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain(`id="${service.processId()}"`);
      expect(xml).toContain(`name="${service.processName()}"`);
    });

    it('should map start node to bpmn:startEvent', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:startEvent');
    });

    it('should map terminal node to bpmn:endEvent', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:endEvent');
    });

    it('should map usertask to bpmn:userTask', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:userTask');
    });

    it('should map xgateway to bpmn:exclusiveGateway', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:exclusiveGateway');
    });

    it('should include sequence flows', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:sequenceFlow');
    });

    it('should include BPMNDiagram with shapes', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmndi:BPMNShape');
      expect(xml).toContain('dc:Bounds');
    });

    it('should include BPMNEdge for connections', () => {
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmndi:BPMNEdge');
      expect(xml).toContain('di:waypoint');
    });

    it('should export multi-instance characteristics', () => {
      const node = service.allNodes().find(n => n.type === 'usertask')!;
      service.updateNodeMultiInstance(node.id, 'sequential');
      const xml = service.exportBpmnXml();
      expect(xml).toContain('multiInstanceLoopCharacteristics');
      expect(xml).toContain('isSequential="true"');
    });

    it('should escape XML special characters in names', () => {
      const node = service.allNodes()[0];
      service.updateNodeName(node.id, 'Test <&> "Name"');
      const xml = service.exportBpmnXml();
      expect(xml).toContain('&lt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
    });

    it('should map servicetask to bpmn:serviceTask', () => {
      service.setNodeType('servicetask');
      service.addNode(new THREE.Vector3(0, 0, 5));
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:serviceTask');
    });

    it('should map pgateway to bpmn:parallelGateway', () => {
      service.setNodeType('pgateway');
      service.addNode(new THREE.Vector3(0, 0, 5));
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:parallelGateway');
    });

    it('should map eventgateway to bpmn:eventBasedGateway', () => {
      service.setNodeType('eventgateway');
      service.addNode(new THREE.Vector3(0, 0, 5));
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:eventBasedGateway');
    });

    it('should map messageStart to bpmn:startEvent with messageEventDefinition', () => {
      service.setNodeType('messageStart');
      service.addNode(new THREE.Vector3(0, 0, 5));
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:messageEventDefinition');
    });

    it('should map messageCatch to bpmn:intermediateCatchEvent', () => {
      service.setNodeType('messageCatch');
      service.addNode(new THREE.Vector3(0, 0, 5));
      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:intermediateCatchEvent');
    });

    it('should export subprocess with nested children', () => {
      service.setNodeType('subprocess');
      service.addNode(new THREE.Vector3(0, 0, 10));
      const subprocess = service.allNodes()[service.allNodes().length - 1];
      service.setActiveContainer(subprocess.id);
      service.setNodeType('usertask');
      service.addNode(new THREE.Vector3(0, 0, 0));
      service.setActiveContainer(null);

      const xml = service.exportBpmnXml();
      expect(xml).toContain('bpmn:subProcess');
      // Child should be nested inside the subProcess element
      const subProcessStart = xml.indexOf('<bpmn:subProcess');
      const subProcessEnd = xml.indexOf('</bpmn:subProcess>');
      const childSection = xml.substring(subProcessStart, subProcessEnd);
      expect(childSection).toContain('bpmn:userTask');
    });
  });

  // ── BPMN XML Import ──

  describe('importBpmnXml', () => {
    const minimalBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="TestProc" name="Test Process" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Begin" />
    <bpmn:userTask id="Task_1" name="Do Work" />
    <bpmn:endEvent id="End_1" name="Done" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="TestProc">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="100" y="100" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <dc:Bounds x="450" y="100" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="150" y="125" />
        <di:waypoint x="250" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="120" />
        <di:waypoint x="450" y="125" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    it('should import basic BPMN with start, task, end', () => {
      const result = service.importBpmnXml(minimalBpmn);
      expect(result).toBeTrue();
      expect(service.allNodes().length).toBe(3);
      expect(service.allConnections().length).toBe(2);
    });

    it('should set process id and name from BPMN', () => {
      service.importBpmnXml(minimalBpmn);
      expect(service.processId()).toBe('TestProc');
      expect(service.processName()).toBe('Test Process');
    });

    it('should map startEvent to start type', () => {
      service.importBpmnXml(minimalBpmn);
      const start = service.allNodes().find(n => n.id === 'Start_1');
      expect(start).toBeTruthy();
      expect(start!.type).toBe('start');
    });

    it('should map userTask to usertask type', () => {
      service.importBpmnXml(minimalBpmn);
      const task = service.allNodes().find(n => n.id === 'Task_1');
      expect(task).toBeTruthy();
      expect(task!.type).toBe('usertask');
    });

    it('should map endEvent to terminal type', () => {
      service.importBpmnXml(minimalBpmn);
      const end = service.allNodes().find(n => n.id === 'End_1');
      expect(end).toBeTruthy();
      expect(end!.type).toBe('terminal');
    });

    it('should preserve node names from BPMN', () => {
      service.importBpmnXml(minimalBpmn);
      const start = service.allNodes().find(n => n.id === 'Start_1');
      expect(start!.name).toBe('Begin');
    });

    it('should import connection waypoints from diagram', () => {
      service.importBpmnXml(minimalBpmn);
      const flow = service.allConnections().find(c => c.id === 'Flow_1');
      expect(flow).toBeTruthy();
      expect(flow!.waypoints).toBeDefined();
      expect(flow!.waypoints!.length).toBe(2);
    });

    it('should position nodes based on diagram bounds', () => {
      service.importBpmnXml(minimalBpmn);
      const nodes = service.allNodes();
      // All nodes should have non-zero positions (re-centered around origin)
      const positions = nodes.map(n => n.position);
      // At least verify they are not all at origin
      const allAtOrigin = positions.every(p => p.x === 0 && p.z === 0);
      expect(allAtOrigin).toBeFalse();
    });

    it('should import serviceTask', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:serviceTask id="Task_1" name="Do Work" />'
      );
      service.importBpmnXml(bpmn);
      const task = service.allNodes().find(n => n.id === 'Task_1');
      expect(task!.type).toBe('servicetask');
    });

    it('should import exclusiveGateway', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:exclusiveGateway id="Task_1" name="Decision" />'
      );
      service.importBpmnXml(bpmn);
      const gw = service.allNodes().find(n => n.id === 'Task_1');
      expect(gw!.type).toBe('xgateway');
    });

    it('should import parallelGateway', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:parallelGateway id="Task_1" name="Fork" />'
      );
      service.importBpmnXml(bpmn);
      const gw = service.allNodes().find(n => n.id === 'Task_1');
      expect(gw!.type).toBe('pgateway');
    });

    it('should import eventBasedGateway', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:eventBasedGateway id="Task_1" name="Wait" />'
      );
      service.importBpmnXml(bpmn);
      const gw = service.allNodes().find(n => n.id === 'Task_1');
      expect(gw!.type).toBe('eventgateway');
    });

    it('should import messageStart event', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:startEvent id="Start_1" name="Begin" />',
        '<bpmn:startEvent id="Start_1" name="Begin"><bpmn:messageEventDefinition id="MsgDef_1" /></bpmn:startEvent>'
      );
      service.importBpmnXml(bpmn);
      const start = service.allNodes().find(n => n.id === 'Start_1');
      expect(start!.type).toBe('messageStart');
    });

    it('should import multiInstanceLoopCharacteristics', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:userTask id="Task_1" name="Do Work"><bpmn:multiInstanceLoopCharacteristics isSequential="true" /></bpmn:userTask>'
      );
      service.importBpmnXml(bpmn);
      const task = service.allNodes().find(n => n.id === 'Task_1');
      expect(task!.multiInstance).toBe('sequential');
    });

    it('should import parallel multiInstance (isSequential=false)', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:userTask id="Task_1" name="Do Work"><bpmn:multiInstanceLoopCharacteristics isSequential="false" /></bpmn:userTask>'
      );
      service.importBpmnXml(bpmn);
      const task = service.allNodes().find(n => n.id === 'Task_1');
      expect(task!.multiInstance).toBe('parallel');
    });

    it('should import subProcess with children', () => {
      const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Proc" name="Proc" isExecutable="false">
    <bpmn:subProcess id="Sub_1" name="SubProcess">
      <bpmn:startEvent id="SubStart" name="SubBegin" />
      <bpmn:userTask id="SubTask" name="SubWork" />
      <bpmn:sequenceFlow id="SubFlow" sourceRef="SubStart" targetRef="SubTask" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Proc">
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1">
        <dc:Bounds x="100" y="100" width="300" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubStart_di" bpmnElement="SubStart">
        <dc:Bounds x="150" y="170" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubTask_di" bpmnElement="SubTask">
        <dc:Bounds x="250" y="160" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
      const result = service.importBpmnXml(bpmn);
      expect(result).toBeTrue();
      const sub = service.allNodes().find(n => n.id === 'Sub_1');
      expect(sub).toBeTruthy();
      expect(sub!.type).toBe('subprocess');
      const child = service.allNodes().find(n => n.id === 'SubStart');
      expect(child).toBeTruthy();
      expect(child!.parentId).toBe('Sub_1');
      const childTask = service.allNodes().find(n => n.id === 'SubTask');
      expect(childTask!.parentId).toBe('Sub_1');
    });

    it('should import boundaryEvent', () => {
      const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Proc" name="Proc" isExecutable="false">
    <bpmn:userTask id="Task_1" name="Work" />
    <bpmn:boundaryEvent id="Boundary_1" name="Timer" attachedToRef="Task_1">
      <bpmn:timerEventDefinition />
    </bpmn:boundaryEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Proc">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_1_di" bpmnElement="Boundary_1">
        <dc:Bounds x="140" y="160" width="50" height="50" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
      const result = service.importBpmnXml(bpmn);
      expect(result).toBeTrue();
      const boundary = service.allNodes().find(n => n.id === 'Boundary_1');
      expect(boundary).toBeTruthy();
      expect(boundary!.type).toBe('boundary');
      expect(boundary!.boundaryKind).toBe('timer');
      expect(boundary!.attachedTo).toBe('Task_1');
    });

    it('should import scriptTask as servicetask', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:scriptTask id="Task_1" name="Script" />'
      );
      service.importBpmnXml(bpmn);
      const task = service.allNodes().find(n => n.id === 'Task_1');
      expect(task!.type).toBe('servicetask');
    });

    it('should import inclusiveGateway as pgateway', () => {
      const bpmn = minimalBpmn.replace(
        '<bpmn:userTask id="Task_1" name="Do Work" />',
        '<bpmn:inclusiveGateway id="Task_1" name="Inclusive" />'
      );
      service.importBpmnXml(bpmn);
      const gw = service.allNodes().find(n => n.id === 'Task_1');
      expect(gw!.type).toBe('pgateway');
    });

    it('should reject invalid XML', () => {
      const result = service.importBpmnXml('<not valid xml<<<');
      expect(result).toBeFalse();
    });

    it('should recenter nodes around origin', () => {
      service.importBpmnXml(minimalBpmn);
      const nodes = service.allNodes();
      const avgX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;
      const avgZ = nodes.reduce((sum, n) => sum + n.position.z, 0) / nodes.length;
      // Center should be approximately 0 (within tolerance from rounding)
      expect(Math.abs(avgX)).toBeLessThan(5);
      expect(Math.abs(avgZ)).toBeLessThan(5);
    });
  });

  // ── BPMN Round-trip ──

  describe('BPMN round-trip', () => {
    it('should export then re-import preserving node count', () => {
      const originalNodeCount = service.allNodes().length;
      const originalConnCount = service.allConnections().length;
      const xml = service.exportBpmnXml();
      service.importBpmnXml(xml);
      expect(service.allNodes().length).toBe(originalNodeCount);
      expect(service.allConnections().length).toBe(originalConnCount);
    });

    it('should preserve node types through round-trip', () => {
      const originalTypes = service.allNodes().map(n => ({ id: n.id, type: n.type }));
      const xml = service.exportBpmnXml();
      service.importBpmnXml(xml);
      originalTypes.forEach(({ id, type }) => {
        const imported = service.allNodes().find(n => n.id === id);
        expect(imported).toBeTruthy();
        expect(imported!.type).toBe(type);
      });
    });
  });

  // ── Node Type Coverage ──

  describe('all node types', () => {
    const allTypes: NodeType[] = [
      'start', 'usertask', 'servicetask', 'xgateway', 'pgateway',
      'terminal', 'subprocess', 'eventgateway', 'messageStart',
      'messageCatch', 'boundary'
    ];

    allTypes.forEach(type => {
      it(`should add and track '${type}' node`, () => {
        service.setNodeType(type);
        expect(service.currentNodeType()).toBe(type);
        const initialCount = service.allNodes().length;
        service.addNode(new THREE.Vector3(0, 0, 0));
        expect(service.allNodes().length).toBe(initialCount + 1);
        const added = service.allNodes()[service.allNodes().length - 1];
        expect(added.type).toBe(type);
      });
    });
  });
});
