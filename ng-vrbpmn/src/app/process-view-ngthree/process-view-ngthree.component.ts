import { Component, inject, computed, signal, NO_ERRORS_SCHEMA, OnDestroy, HostListener, ViewChild, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import {
  NgxThreeModule,
  ThPerspectiveCamera,
  ThCanvas,
  ThScene,
  ThAmbientLight,
  ThPointLight,
  ThGroup,
  ThMesh,
  ThPlaneGeometry,
  ThMeshStandardMaterial,
  ThObject3D,
  ThCylinderGeometry,
  ThBoxGeometry,
  ThMeshPhysicalMaterial,
  ThSphereGeometry,
  ThOctahedronGeometry,
  ThCapsuleGeometry,
  ThTorusGeometry,
  ThCSS2DObject,
  ThLine,
  ThLineBasicMaterial,
  ThTubeGeometry,
  ThRingGeometry,
  ThMeshBasicMaterial,
  ThOrbitControls,
  ThConeGeometry,
  ThEngineService,
  HOST_ELEMENT,
  provideWebGLRenderer,
  provideCSS2dRenderer
} from 'ngx-three';
import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import * as THREE from 'three';
import { ProcessStateService, NodeType, Connection, Node } from './process-state.service';
import { UIOverlayComponent } from './ui/ui-overlay.component';
import { ThreePointerEvent, ThreeRenderEvent, ThreeCanvasClickEvent, ThreeMouseMoveEvent } from './process-view.types';
import { SCENE_CONFIG, CONNECTION_CONFIG, NODE_CONFIG, ARROW_CONFIG, FOOTPRINT_CONFIG, CAMERA_CONFIG, COLORS, LIGHT_CONFIG, GRID_CONFIG } from './process-view.constants';
import { getConnPath, getArrowPos, getArrowQuat, getFootprintPos, isSubprocessNode } from './connection-path.builder';
import { VrSessionService } from './vr-session.service';

function resolveThreeObject<T = THREE.Object3D>(ref: any): T | null {
  return ref?.object3d ?? ref?.object3D ?? ref?.threeObject ?? ref?._objRef ?? ref?.camera ?? null;
}

@Component({
  selector: 'app-process-view-ngthree',
  templateUrl: './process-view-ngthree.component.html',
  styleUrls: ['./process-view-ngthree.component.scss'],
  standalone: true,
  imports: [
    NgxThreeModule,
    NgTemplateOutlet,
    UpperCasePipe,
    UIOverlayComponent,
    ThCanvas,
    ThScene,
    ThPerspectiveCamera,
    ThAmbientLight,
    ThPointLight,
    ThGroup,
    ThMesh,
    ThPlaneGeometry,
    ThMeshStandardMaterial,
    ThObject3D,
    ThCylinderGeometry,
    ThBoxGeometry,
    ThMeshPhysicalMaterial,
    ThSphereGeometry,
    ThOctahedronGeometry,
    ThCapsuleGeometry,
    ThTorusGeometry,
    ThCSS2DObject,
    ThLine,
    ThLineBasicMaterial,
    ThTubeGeometry,
    ThRingGeometry,
  ThMeshBasicMaterial,
  ThOrbitControls,
  ThConeGeometry
  ],
  providers: [
    ThEngineService,
    { provide: HOST_ELEMENT, useExisting: ElementRef },
    ...provideWebGLRenderer(),
    ...provideCSS2dRenderer()
  ],
  schemas: [NO_ERRORS_SCHEMA] // Keep it for extra safety with non-standard attributes
})
export class ProcessViewNgThreeComponent implements OnInit, OnDestroy {
  @ViewChild('camera') private cameraRef?: ThPerspectiveCamera;
  @ViewChild('controls') private controlsRef?: ThOrbitControls;
  @ViewChild('scene') private sceneRef?: any;
  // ===== Services =====
  public state = inject(ProcessStateService);
  private engine = inject(ThEngineService);
  private cdr = inject(ChangeDetectorRef);
  private vrService = inject(VrSessionService);

  // ===== Template Helpers =====
  public Math = Math;
  public THREE = THREE;
  public lookAt: [number, number, number] = [0, 0, 0];
  public renderNodes = computed(() => this.state.allNodes().filter(node => !node.parentId));

  // ===== Constants (exposed for template) =====
  public readonly COLORS = COLORS;
  public readonly CAMERA_CONFIG = CAMERA_CONFIG;
  public readonly LIGHT_CONFIG = LIGHT_CONFIG;

  // ===== Scene Objects =====
  public grid = new THREE.GridHelper(GRID_CONFIG.SIZE, GRID_CONFIG.DIVISIONS, GRID_CONFIG.COLOR_1, GRID_CONFIG.COLOR_2);

  // Geometry cache to prevent recreation on every frame
  private geometryCache = new Map<string, THREE.BufferGeometry>();
  private dragStartPoint: THREE.Vector3 | null = null;
  private dragStartPositions = new Map<string, THREE.Vector3>();
  private suppressGroundClick = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPlaneY = 0;
  private lastDragPlanePoint: THREE.Vector3 | null = null;
  private lastCamera: THREE.Camera | null = null;
  private readonly snapStep = 0.5;
  private nodeObjectMap = new Map<string, THREE.Object3D>();
  private subprocessFootprintCache = new Map<string, { key: string; geom: THREE.BufferGeometry }>();

  // VR state exposed for template binding — delegates to VrSessionService
  public get xrSupported() { return this.vrService.xrSupported; }
  public get xrActive() { return this.vrService.xrActive(); }

  public resizingNodeId = signal<string | null>(null);
  public activeResizeEdge = signal<'top' | 'bottom' | 'left' | 'right' | null>(null);
  public hoveredResizeNodeId = signal<string | null>(null);
  public activeHoveredEdge = signal<'top' | 'bottom' | 'left' | 'right' | null>(null);
  private resizeStartPos: THREE.Vector3 | null = null;
  private resizeStartBounds: { width: number; height: number } | null = null;
  private resizeStartNodePos: THREE.Vector3 | null = null; // Original node position before resize
  private isResizeHandleClicked = false; // Flag to prevent drag when clicking resize handle
  private readonly resizePadding = 0.6;
  private readonly resizeHandleSize = 0.3;
  public readonly resizeHandleColor = new THREE.Color(0xff9900);
  public readonly resizeHandleHoverColor = new THREE.Color(0xffcc00);

  // Computed signal for connection geometries - only recalculates when nodes/connections change
  public connectionGeometries = computed(() => {
    const conns = this.state.allConnections();
    const nodes = this.state.allNodes();
    const geometries = new Map<string, THREE.BufferGeometry>();

    // Dispose old geometries not in current connections
    this.geometryCache.forEach((geom, id) => {
      if (!conns.find(c => c.id === id)) {
        geom.dispose();
        this.geometryCache.delete(id);
      }
    });

    // Create or reuse geometries
    conns.forEach(conn => {
      let geom = this.geometryCache.get(conn.id);
      if (!geom) {
        geom = new THREE.BufferGeometry().setFromPoints(
          getConnPath(conn, nodes).getSpacedPoints(CONNECTION_CONFIG.PATH_SEGMENTS)
        );
        this.geometryCache.set(conn.id, geom);
      } else {
        geom.setFromPoints(
          getConnPath(conn, nodes).getSpacedPoints(CONNECTION_CONFIG.PATH_SEGMENTS)
        );
      }
      geometries.set(conn.id, geom);
    });

    return geometries;
  });

  constructor() {
    this.grid.position.y = SCENE_CONFIG.GROUND_Y + SCENE_CONFIG.GROUND_OFFSET;
    if (this.grid.material instanceof THREE.Material) {
      this.grid.material.transparent = true;
      this.grid.material.opacity = SCENE_CONFIG.GRID_OPACITY;
    }
  }

  ngOnInit() {
    this.vrService.setReferences(this.cameraRef, this.controlsRef, null, this.sceneRef, this.engine, this.cdr);
    this.vrService.setNodeObjectMap(this.nodeObjectMap);
    this.vrService.setOnNodeSelected((nodeId) => {
      if (nodeId) this.state.selectNode(nodeId);
    });
    this.vrService.setOnVrSessionEnd(() => this.cdr.markForCheck());
    this.vrService.checkSupport();
  }

  ngOnDestroy() {
    // Dispose all cached geometries to prevent memory leaks
    this.geometryCache.forEach(geom => geom.dispose());
    this.geometryCache.clear();
    this.subprocessFootprintCache.forEach(entry => entry.geom.dispose());
    this.subprocessFootprintCache.clear();
    this.nodeObjectMap.clear();

    // Dispose grid
    this.grid.geometry?.dispose();
    if (this.grid.material instanceof THREE.Material) {
      this.grid.material.dispose();
    }
  }

  // Node Helpers
  isRound(type: NodeType) {
    return type === 'start' || type === 'terminal' || type.endsWith('gateway') || type === 'messageStart' || type === 'messageCatch' || type === 'boundary';
  }

  public childNodesFor(parentId: string) {
    return this.state.allNodes().filter(node => node.parentId === parentId);
  }

  public getChildLocalPosition(child: Node, parent: Node): [number, number, number] {
    return [
      child.position.x - parent.position.x,
      child.position.y - parent.position.y,
      child.position.z - parent.position.z
    ];
  }

  public getSubprocessShellDims(node: Node, layer: 'outer' | 'inner'): { width: number; height: number; depth: number } {
    const baseW = node.bounds?.width ?? 4;
    const baseD = node.bounds?.height ?? 3;
    const scale = layer === 'outer' ? 1.05 : 0.95;
    return {
      width: baseW * scale,
      height: 1.6,
      depth: baseD * scale
    };
  }

  public getSubprocessFootprintPos(node: Node): [number, number, number] {
    // place footprint on the connector plane in world space
    const localY = CONNECTION_CONFIG.Y_POSITION - node.position.y;
    return [0, localY, 0];
  }

  public getSubprocessFootprintGeometry(node: Node): THREE.BufferGeometry {
    const shell = this.getSubprocessShellDims(node, 'outer');
    const radius = this.getSubprocessCornerRadius(shell.width, shell.depth);
    const key = `${shell.width.toFixed(3)}:${shell.depth.toFixed(3)}:${radius.toFixed(3)}`;
    const cached = this.subprocessFootprintCache.get(node.id);
    if (cached?.key === key) return cached.geom;
    if (cached) cached.geom.dispose();

    const points = this.getSubprocessFootprintPoints(node);
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    this.subprocessFootprintCache.set(node.id, { key, geom });
    return geom;
  }

  public getSubprocessMinSize(node: Node): { width: number; depth: number } {
    const children = this.state.allNodes().filter(n => n.parentId === node.id);
    
    // If no children, return a reasonable minimum size
    if (children.length === 0) {
      return {
        width: 2.0,
        depth: 2.0
      };
    }

    // Calculate bounding box of all children relative to parent
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    children.forEach(child => {
      const localX = child.position.x - node.position.x;
      const localZ = child.position.z - node.position.z;
      
      // Get the half-size of the child
      const halfSize = this.isRound(child.type) ? 0.75 : 0.6;
      
      minX = Math.min(minX, localX - halfSize);
      maxX = Math.max(maxX, localX + halfSize);
      minZ = Math.min(minZ, localZ - halfSize);
      maxZ = Math.max(maxZ, localZ + halfSize);
    });

    // Add padding around children
    const requiredWidth = (maxX - minX) + this.resizePadding * 2;
    const requiredDepth = (maxZ - minZ) + this.resizePadding * 2;

    return {
      width: Math.max(2.0, requiredWidth),
      depth: Math.max(2.0, requiredDepth)
    };
  }

  public getSubprocessEdgeHandles(node: Node): Array<{ edge: 'top' | 'bottom' | 'left' | 'right'; position: [number, number, number] }> {
    const shell = this.getSubprocessShellDims(node, 'outer');
    const halfW = shell.width / 2;
    const halfD = shell.depth / 2;
    // Position handles at footprint level (same as footprint positioning)
    const localY = CONNECTION_CONFIG.Y_POSITION - node.position.y;
    const handles: Array<{ edge: 'top' | 'bottom' | 'left' | 'right'; position: [number, number, number] }> = [
      { edge: 'top', position: [0, localY, -halfD] },
      { edge: 'bottom', position: [0, localY, halfD] },
      { edge: 'left', position: [-halfW, localY, 0] },
      { edge: 'right', position: [halfW, localY, 0] }
    ];
    return handles;
  }

  public getResizeHandleWorldPos(node: Node, handle: { edge: string; position: [number, number, number] }): [number, number, number] {
    // Convert from local to world coordinates
    return [
      node.position.x + handle.position[0],
      node.position.y + handle.position[1],
      node.position.z + handle.position[2]
    ];
  }

  onResizeHandleHover(event: any, nodeId: string, edge: 'top' | 'bottom' | 'left' | 'right', isHovering: boolean) {
    if (isHovering) {
      this.hoveredResizeNodeId.set(nodeId);
      this.activeHoveredEdge.set(edge);
      // Pre-emptively set the flag when hovering over handle
      // This prevents drag from starting if user clicks while hovering
      this.isResizeHandleClicked = true;
    } else {
      // Only clear if this was the currently hovered handle
      if (this.hoveredResizeNodeId() === nodeId && this.activeHoveredEdge() === edge) {
        this.hoveredResizeNodeId.set(null);
        this.activeHoveredEdge.set(null);
      }
      // Clear the flag when leaving handle (unless actively resizing)
      if (!this.resizingNodeId()) {
        this.isResizeHandleClicked = false;
      }
    }
  }

  onResizeHandleClick(event: any, nodeId: string, edge: 'top' | 'bottom' | 'left' | 'right') {
    this.stopEvent(event);
    // Don't do anything here - onPointerDown already handled it
  }

  onResizeEdgeDown(event: any, nodeId: string, edge: 'top' | 'bottom' | 'left' | 'right') {
    // Set flag immediately to prevent drag
    this.isResizeHandleClicked = true;
    
    this.stopEvent(event);
    this.suppressGroundClick = true;
    
    const node = this.state.allNodes().find(n => n.id === nodeId);
    if (!node || node.type !== 'subprocess') {
      this.isResizeHandleClicked = false;
      return;
    }

    // Store the current node position before any drag changes
    const originalPosition = node.position.clone();

    // Prevent any drag operation from starting and end any existing drag
    this.state.draggedNodeId.set(null);
    this.state.endDrag();
    this.dragStartPoint = null;
    this.dragStartPositions.clear();
    this.lastDragPlanePoint = null;
    
    // Restore original position if drag moved it
    if (!originalPosition.equals(node.position)) {
      this.state.moveNode(nodeId, originalPosition);
    }
    
    this.resizingNodeId.set(nodeId);
    this.activeResizeEdge.set(edge);
    this.resizeStartPos = this.projectPointerToPlane(event, CONNECTION_CONFIG.Y_POSITION);
    this.resizeStartBounds = { width: node.bounds?.width ?? 4, height: node.bounds?.height ?? 3 };
    this.resizeStartNodePos = node.position.clone(); // Store original position
    this.state.statusMessage.set('Resizing subprocess... Press ESC to cancel.');
  }

  onResizeEdgeMove(event: any) {
    const nodeId = this.resizingNodeId();
    const edge = this.activeResizeEdge();
    if (!nodeId || !edge || !this.resizeStartPos || !this.resizeStartBounds) return;

    const currentPos = this.projectPointerToPlane(event, CONNECTION_CONFIG.Y_POSITION);
    if (!currentPos) return;

    const node = this.state.allNodes().find(n => n.id === nodeId);
    if (!node) return;

    const deltaX = currentPos.x - this.resizeStartPos.x;
    const deltaZ = currentPos.z - this.resizeStartPos.z;
    const minSize = this.getSubprocessMinSize(node);

    let newWidth = this.resizeStartBounds.width;
    let newDepth = this.resizeStartBounds.height;
    let offsetX = 0;
    let offsetZ = 0;

    if (edge === 'left') {
      // Dragging left edge: move it left/right, opposite edge stays fixed
      newWidth = Math.max(minSize.width, this.resizeStartBounds.width - deltaX * 2);
      offsetX = -(newWidth - this.resizeStartBounds.width) / 2;
    } else if (edge === 'right') {
      // Dragging right edge: move it left/right, opposite edge stays fixed
      newWidth = Math.max(minSize.width, this.resizeStartBounds.width + deltaX * 2);
      offsetX = (newWidth - this.resizeStartBounds.width) / 2;
    } else if (edge === 'top') {
      // Dragging top edge: move it up/down, opposite edge stays fixed
      newDepth = Math.max(minSize.depth, this.resizeStartBounds.height - deltaZ * 2);
      offsetZ = -(newDepth - this.resizeStartBounds.height) / 2;
    } else if (edge === 'bottom') {
      // Dragging bottom edge: move it up/down, opposite edge stays fixed
      newDepth = Math.max(minSize.depth, this.resizeStartBounds.height + deltaZ * 2);
      offsetZ = (newDepth - this.resizeStartBounds.height) / 2;
    }

    // Calculate absolute new position based on original start position
    const newPosX = this.resizeStartNodePos!.x + offsetX;
    const newPosZ = this.resizeStartNodePos!.z + offsetZ;
    
    // Update bounds
    this.state.resizeSubprocessBounds(nodeId, newWidth, newDepth, 0, 0);
    
    // Update position separately to absolute position
    const newPos = new THREE.Vector3(newPosX, this.resizeStartNodePos!.y, newPosZ);
    this.state.moveNode(nodeId, newPos);
  }

  onResizeEdgeUp() {
    if (this.resizingNodeId()) {
      this.state.statusMessage.set('Subprocess resized.');
    }
    this.resizingNodeId.set(null);
    this.activeResizeEdge.set(null);
    this.resizeStartPos = null;
    this.resizeStartBounds = null;
    this.resizeStartNodePos = null;
    this.isResizeHandleClicked = false; // Clear the flag
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.resizingNodeId()) {
        this.cancelResize();
      } else if (this.xrActive) {
        this.vrService.toggleVr();
      }
    }
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMoveForResize(event: PointerEvent) {
    // Resize takes priority over dragging
    if (this.resizingNodeId()) {
      this.onResizeEdgeMove(event);
      return;
    }
    
    // Handle node dragging
    if (this.state.draggedNodeId()) {
      const dragPoint = this.projectPointerToPlane(event, this.dragPlaneY) ?? this.lastDragPlanePoint;
      if (dragPoint) {
        this.handleDrag(dragPoint);
      }
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onWindowPointerUpForResize(event: PointerEvent) {
    // Handle resize end
    if (this.resizingNodeId()) {
      this.onResizeEdgeUp();
    }
    
    // Handle drag end
    this.state.endDrag();
    this.dragStartPoint = null;
    this.dragStartPositions.clear();
    
    // Allow ground clicks after this tick
    setTimeout(() => (this.suppressGroundClick = false), 0);
  }

  cancelResize() {
    if (this.resizingNodeId()) {
      this.state.statusMessage.set('Resize cancelled.');
    }
    this.resizingNodeId.set(null);
    this.activeResizeEdge.set(null);
    this.resizeStartPos = null;
    this.resizeStartBounds = null;
    this.resizeStartNodePos = null;
    this.isResizeHandleClicked = false; // Clear the flag
  }

  public isSubprocessHovered(nodeId: string): boolean {
    const result = this.state.hoveredNodeId() === nodeId || this.hoveredResizeNodeId() === nodeId;
    return result;
  }

  onNodeDown(event: any, nodeId: string) {
    // Don't handle node clicks if a resize handle was just clicked
    if (this.isResizeHandleClicked) {
      return;
    }
    
    // Don't handle node clicks if we're currently resizing
    if (this.resizingNodeId()) {
      return;
    }
    
    this.stopEvent(event);
    this.suppressGroundClick = true;
    const shiftKey = this.getShiftKey(event);
    const alreadySelected = this.state.selectedNodeIds().includes(nodeId);
    if (this.state.interactionMode() === 'move') {
      if (shiftKey) {
        this.state.toggleNodeSelection(nodeId);
        return;
      }
      // If multiple selected and clicking one of them, keep selection and start drag for the group
      if (alreadySelected && this.state.selectedNodeIds().length > 1) {
        this.beginDrag(event, nodeId); // beginDrag will set draggedNodeId internally
        return;
      }
      // Single selection drag
      this.state.selectNode(nodeId);
      this.beginDrag(event, nodeId); // beginDrag will set draggedNodeId internally
      return;
    }
    this.state.selectNode(nodeId);
  }

  onNodeRender(event: any, nodeId: string) {
    const group = event.object as THREE.Group;
    if (!this.nodeObjectMap.has(nodeId)) {
      this.nodeObjectMap.set(nodeId, group);
    }
    const time = Date.now() * 0.001;
    const isHovered = this.state.hoveredNodeId() === nodeId;

    // Base Rotation
    group.rotation.y += NODE_CONFIG.BASE_ROTATION_SPEED;

    // Hover Effects
    if (isHovered) {
      group.rotation.y += NODE_CONFIG.HOVER_ROTATION_SPEED;
      group.position.y = Math.sin(time * NODE_CONFIG.HOVER_BOUNCE_SPEED) * NODE_CONFIG.HOVER_BOUNCE_AMPLITUDE;
    } else {
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0, 0.1);
    }
  }

  onLabelClick(event: MouseEvent, nodeId: string) {
    event.stopPropagation();
    this.state.selectNode(nodeId);
    this.state.openModal();
  }

  // Connection Helpers — delegates to ConnectionPathBuilder
  getConnPath(conn: Connection) {
    return getConnPath(conn, this.state.allNodes());
  }

  getConnGeometry(conn: Connection): THREE.BufferGeometry {
    return this.connectionGeometries().get(conn.id) || new THREE.BufferGeometry();
  }

  getArrowPos(conn: Connection) {
    return getArrowPos(conn, this.state.allNodes());
  }

  getArrowQuat(conn: Connection) {
    return getArrowQuat(conn, this.state.allNodes());
  }

  getFootprintPos(conn: Connection, type: 'source' | 'target') {
    return getFootprintPos(conn, this.state.allNodes(), type);
  }

  public isSubprocessNode(nodeId: string): boolean {
    return isSubprocessNode(nodeId, this.state.allNodes());
  }

  onConnClick(event: any, connId: string) {
    this.stopEvent(event);
    this.suppressGroundClick = true;
    if (this.state.interactionMode() === 'delete') {
      this.state.deleteConnection(connId);
      return;
    }
    this.state.selectConnection(connId);
  }

  // General Interactions
  onGroundPointer(event: any) {
    if (this.suppressGroundClick) return;
    if (event?.object?.name !== 'ground') return;
    this.onCanvasClick(event);
  }

  onCanvasClick(event: any) {
    if (!this.isGroundPrimary(event)) {
      return;
    }
    if (this.state.interactionMode() === 'add') {
      const point = this.getDragPoint(event);
      if (!point) return;
      if (this.state.snapToGrid()) {
        point.x = this.snapValue(point.x);
        point.z = this.snapValue(point.z);
      }
      point.y = 0;
      this.state.addNode(point);
      return;
    }
    if (this.isGroundEvent(event)) {
      this.state.clearSelection();
    }
  }

  onMouseMove(event: any) {
    const draggedId = this.state.draggedNodeId();
    if (!draggedId) return;
    const dragPoint = this.projectPointerToPlane(event, this.dragPlaneY) ?? this.lastDragPlanePoint;
    if (!dragPoint) return;
    this.handleDrag(dragPoint);
  }

  private handleDrag(dragPoint: THREE.Vector3) {
    this.lastDragPlanePoint = dragPoint.clone();
    const pos = dragPoint.clone();
    pos.y = this.dragPlaneY;
    if (!this.dragStartPoint) {
      this.dragStartPoint = pos.clone();
      this.dragStartPositions.clear();
      this.state.selectedNodeIds().forEach(id => {
        const node = this.state.allNodes().find(n => n.id === id);
        if (node) this.dragStartPositions.set(id, node.position.clone());
      });
    }
    const delta = pos.clone().sub(this.dragStartPoint!);
    delta.y = 0;
    const selectedIds = this.state.selectedNodeIds();
    const effectiveIds = this.filterDescendants(selectedIds);
    const snap = this.state.snapToGrid();
    effectiveIds.forEach(id => {
      const start = this.dragStartPositions.get(id);
      if (!start) return;
      const next = start.clone().add(delta);
      next.y = start.y;
      if (snap) {
        next.x = this.snapValue(next.x);
        next.z = this.snapValue(next.z);
      }
      this.state.moveNode(id, next);
    });
  }

  private beginDrag(event: any, nodeId: string) {
    // Don't start drag if resize handle was clicked
    if (this.isResizeHandleClicked) {
      return;
    }
    
    // Don't start drag if we're resizing
    if (this.resizingNodeId()) {
      return;
    }
    
    this.state.draggedNodeId.set(nodeId);
    
    const node = this.state.allNodes().find(n => n.id === nodeId);
    this.dragPlaneY = node?.position.y ?? 0;
    const pointerHit = this.projectPointerToPlane(event, this.dragPlaneY);
    this.dragStartPoint = pointerHit ?? node?.position.clone() ?? null;
    this.lastDragPlanePoint = this.dragStartPoint ? this.dragStartPoint.clone() : null;
    this.dragStartPositions.clear();
    this.state.selectedNodeIds().forEach(id => {
      const n = this.state.allNodes().find(x => x.id === id);
      if (n) this.dragStartPositions.set(id, n.position.clone());
    });
  }

  private getDragPoint(event: any, planeY = this.dragPlaneY): THREE.Vector3 | null {
    return this.projectPointerToPlane(event, planeY);
  }

  private isGroundEvent(event: any): boolean {
    if (event?.object?.name === 'ground') return true;
    const intersects = event?.intersects as Array<{ object?: THREE.Object3D }> | undefined;
    return !!intersects?.some((i: any) => i.object?.name === 'ground');
  }

  private isGroundPrimary(event: any): boolean {
    if (event?.object?.name === 'ground') return true;
    const first = event?.intersects?.[0];
    return first?.object?.name === 'ground';
  }

  private snapValue(value: number): number {
    return Math.round(value / this.snapStep) * this.snapStep;
  }

  private projectPointerToPlane(event: any, planeY: number): THREE.Vector3 | null {
    // 1) Use existing intersection point if present
    const intersects = event?.intersects as Array<{ object?: THREE.Object3D; point?: THREE.Vector3 }> | undefined;
    const groundHit = intersects?.find(i => i.object?.name === 'ground');
    const anyHit = intersects?.find(i => i.point);
    const pFromHit = groundHit?.point ?? anyHit?.point ?? event?.point;
    if (pFromHit) {
      const p = pFromHit.clone();
      p.y = planeY;
      return p;
    }

    // 2) Raycast from pointer coords to plane
    const camObj: THREE.PerspectiveCamera | undefined =
      (event?.camera as THREE.PerspectiveCamera | undefined) ??
      resolveThreeObject<THREE.PerspectiveCamera>(this.cameraRef) ??
      (this.lastCamera as THREE.PerspectiveCamera | undefined) ??
      undefined;
    if (event?.camera) this.lastCamera = event.camera;
    if (camObj) {
      const client = this.extractClientCoords(event);
      if (client) {
        this.pointer.x = (client.x / window.innerWidth) * 2 - 1;
        this.pointer.y = -(client.y / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, camObj);
        const hit = new THREE.Vector3();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const ok = this.raycaster.ray.intersectPlane(plane, hit);
        if (ok) return hit;
      }
    }

    // 3) Fallback: use last known plane point if available
    if (this.lastDragPlanePoint) return this.lastDragPlanePoint.clone();
    return null;
  }

  private extractClientCoords(event: any): { x: number; y: number } | null {
    const candidates = [
      event?.event,
      event?.domEvent,
      event?.nativeEvent,
      event
    ];
    for (const e of candidates) {
      if (typeof e?.clientX === 'number' && typeof e?.clientY === 'number') {
        return { x: e.clientX, y: e.clientY };
      }
    }
    return null;
  }

  private stopEvent(event: any) {
    event?.stopPropagation?.();
    event?.event?.stopPropagation?.();
    event?.domEvent?.stopPropagation?.();
  }

  private getShiftKey(event: any): boolean {
    const candidates = [
      event,
      event?.event,
      event?.domEvent,
      event?.nativeEvent,
      event?.pointerEvent,
      event?.srcEvent,
      typeof window !== 'undefined' ? (window as any).event : undefined
    ];
    return candidates.some(e => e?.shiftKey === true);
  }

  public toggleVr() {
    this.vrService.setReferences(this.cameraRef, this.controlsRef, null, this.sceneRef, this.engine, this.cdr);
    this.vrService.setNodeObjectMap(this.nodeObjectMap);
    return this.vrService.toggleVr();
  }

  public resetView() {
    this.vrService.setReferences(this.cameraRef, this.controlsRef, null, this.sceneRef, this.engine, this.cdr);
    this.vrService.resetView();
  }

  private filterDescendants(ids: string[]): string[] {
    if (ids.length < 2) return ids;
    const all = this.state.allNodes();
    const byId = new Map(all.map(node => [node.id, node]));
    const selected = new Set(ids);
    return ids.filter(id => {
      let current = byId.get(id);
      while (current?.parentId) {
        if (selected.has(current.parentId)) return false;
        current = byId.get(current.parentId);
      }
      return true;
    });
  }

  private getSubprocessCornerRadius(width: number, depth: number): number {
    return Math.min(width, depth) * 0.12;
  }

  private getSubprocessFootprintPoints(node: Node): THREE.Vector3[] {
    const shell = this.getSubprocessShellDims(node, 'outer');
    const radius = this.getSubprocessCornerRadius(shell.width, shell.depth);
    const hw = shell.width / 2;
    const hd = shell.depth / 2;
    const r = Math.min(radius, hw, hd);
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hd - r);
    shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw + r, hd);
    shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hd + r);
    shape.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);

    const pts = shape.getPoints(64).map(p => new THREE.Vector3(p.x, 0, p.y));
    if (pts.length) pts.push(pts[0].clone());
    return pts;
  }

  public buildFootprintPath(node: Node): THREE.CurvePath<THREE.Vector3> {
    const pts = this.getSubprocessFootprintPoints(node);
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length - 1; i += 1) {
      path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    }
    return path;
  }
}
