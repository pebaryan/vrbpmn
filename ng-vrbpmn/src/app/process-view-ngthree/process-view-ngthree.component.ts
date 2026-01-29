import { Component, inject, computed, NO_ERRORS_SCHEMA, OnDestroy, HostListener, ViewChild, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
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
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { ProcessStateService, NodeType, Connection, Node } from './process-state.service';
import { UIOverlayComponent } from './ui/ui-overlay.component';
import { ThreePointerEvent, ThreeRenderEvent, ThreeCanvasClickEvent, ThreeMouseMoveEvent } from './process-view.types';
import { SCENE_CONFIG, CONNECTION_CONFIG, NODE_CONFIG, ARROW_CONFIG, FOOTPRINT_CONFIG, CAMERA_CONFIG, COLORS, LIGHT_CONFIG, GRID_CONFIG } from './process-view.constants';

@Component({
  selector: 'app-process-view-ngthree',
  templateUrl: './process-view-ngthree.component.html',
  styleUrls: ['./process-view-ngthree.component.scss'],
  standalone: true,
  imports: [
    NgxThreeModule,
    CommonModule,
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

  // ===== Template Helpers =====
  public Math = Math;
  public THREE = THREE;
  public lookAt: [number, number, number] = [0, 0, 0];
  public sceneOffset = computed<[number, number, number]>(() => {
    const nodes = this.state.allNodes();
    if (!nodes.length) return [0, 0, 0];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    nodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minZ = Math.min(minZ, node.position.z);
      maxZ = Math.max(maxZ, node.position.z);
    });
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const depth = 3.5;
    return [-centerX, 0, -centerZ - depth];
  });

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
  private prevCameraPos: THREE.Vector3 | null = null;
  private prevControlsTarget: THREE.Vector3 | null = null;
  private prevNodePositions: Map<string, THREE.Vector3> | null = null;
  private readonly snapStep = 0.5;
  private xrSession: any = null;
  private xrSelectHandler?: (event: any) => void;
  private xrRenderer: any = null;
  private nodeObjectMap = new Map<string, THREE.Object3D>();
  public xrSupported: boolean | null = null;
  public xrActive = false;

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
          this.computeConnPath(conn, nodes).getSpacedPoints(CONNECTION_CONFIG.PATH_SEGMENTS)
        );
        this.geometryCache.set(conn.id, geom);
      } else {
        // Update existing geometry
        geom.setFromPoints(
          this.computeConnPath(conn, nodes).getSpacedPoints(CONNECTION_CONFIG.PATH_SEGMENTS)
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

  async ngOnInit() {
    if (!('xr' in navigator)) {
      this.xrSupported = false;
      return;
    }
    try {
      const supported = await (navigator as any).xr?.isSessionSupported?.('immersive-vr');
      // Defer state update to next tick to avoid ExpressionChanged errors
      Promise.resolve().then(() => {
        this.xrSupported = !!supported;
        this.cdr.markForCheck();
      });
    } catch {
      Promise.resolve().then(() => {
        this.xrSupported = false;
        this.cdr.markForCheck();
      });
    }
  }

  ngOnDestroy() {
    // Dispose all cached geometries to prevent memory leaks
    this.geometryCache.forEach(geom => geom.dispose());
    this.geometryCache.clear();

    // Dispose grid
    this.grid.geometry?.dispose();
    if (this.grid.material instanceof THREE.Material) {
      this.grid.material.dispose();
    }
  }

  // Node Helpers
  isRound(type: NodeType) {
    return type === 'start' || type === 'terminal' || type.endsWith('gateway');
  }

  onNodeDown(event: any, nodeId: string) {
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
        this.state.draggedNodeId.set(nodeId);
        this.beginDrag(event, nodeId);
        return;
      }
      // Single selection drag
      this.state.selectNode(nodeId);
      this.beginDrag(event, nodeId);
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

  // Connection Helpers
  private computeConnPath(conn: Connection, nodes: Node[]): THREE.CurvePath<THREE.Vector3> {
    const source = nodes.find(n => n.id === conn.sourceId);
    const target = nodes.find(n => n.id === conn.targetId);
    if (!source || !target) return new THREE.CurvePath<THREE.Vector3>();

    const a = source.position.clone();
    const b = target.position.clone();
    a.y = CONNECTION_CONFIG.Y_POSITION;
    b.y = CONNECTION_CONFIG.Y_POSITION;

    const path = new THREE.CurvePath<THREE.Vector3>();
    const diffX = b.x - a.x;
    const diffZ = b.z - a.z;

    const absX = Math.abs(diffX);
    const absZ = Math.abs(diffZ);

    // Straight line for very close nodes
    if (absX < CONNECTION_CONFIG.MIN_DISTANCE_FOR_CORNER || absZ < CONNECTION_CONFIG.MIN_DISTANCE_FOR_CORNER) {
      const dir = b.clone().sub(a).normalize();
      path.add(new THREE.LineCurve3(
        a.clone().add(dir.clone().multiplyScalar(CONNECTION_CONFIG.NODE_OFFSET)),
        b.clone().sub(dir.clone().multiplyScalar(CONNECTION_CONFIG.NODE_OFFSET))
      ));
      return path;
    }

    const signX = diffX >= 0 ? 1 : -1;
    const signZ = diffZ >= 0 ? 1 : -1;
    const offset = CONNECTION_CONFIG.NODE_OFFSET;

    const startOut = new THREE.Vector3(a.x + signX * offset, a.y, a.z);
    const targetEntry = new THREE.Vector3(b.x - signX * offset, a.y, b.z - signZ * offset);
    const corner = new THREE.Vector3(targetEntry.x, a.y, startOut.z);

    const availableX = Math.max(0, Math.abs(corner.x - startOut.x));
    const availableZ = Math.max(0, Math.abs(targetEntry.z - corner.z));
    const maxRadius = Math.min(CONNECTION_CONFIG.CORNER_RADIUS, availableX, availableZ);

    if (maxRadius <= 0.0001) {
      // Fallback to hard L
      path.add(new THREE.LineCurve3(startOut, corner));
      path.add(new THREE.LineCurve3(corner, targetEntry));
      return path;
    }

    const preCorner = corner.clone().add(new THREE.Vector3(-signX * maxRadius, 0, 0));
    const postCorner = corner.clone().add(new THREE.Vector3(0, 0, signZ * maxRadius));

    // First leg to rounded corner entry
    path.add(new THREE.LineCurve3(startOut, preCorner));
    // Rounded corner
    path.add(new THREE.QuadraticBezierCurve3(preCorner, corner, postCorner));
    // Second leg to target entry
    path.add(new THREE.LineCurve3(postCorner, targetEntry));

    return path;
  }

  getConnPath(conn: Connection) {
    return this.computeConnPath(conn, this.state.allNodes());
  }

  getConnGeometry(conn: Connection): THREE.BufferGeometry {
    // Use cached geometry from computed signal
    return this.connectionGeometries().get(conn.id) || new THREE.BufferGeometry();
  }

  getArrowPos(conn: Connection) {
    const path = this.getConnPath(conn);
    const pts = path.getPoints(20);
    return pts[pts.length - 1];
  }

  getArrowQuat(conn: Connection) {
    const path = this.getConnPath(conn);
    const pts = path.getPoints(20);
    if (pts.length < 2) return new THREE.Quaternion();
    const dir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return quat;
  }

  getFootprintPos(conn: Connection, type: 'source' | 'target') {
    const nodes = this.state.allNodes();
    const node = nodes.find(n => n.id === (type === 'source' ? conn.sourceId : conn.targetId));
    if (!node) return new THREE.Vector3();
    const p = node.position.clone();
    p.y = -1.49;
    return p;
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

  onMouseUp(event: MouseEvent) {
    this.state.endDrag();
    this.dragStartPoint = null;
    this.dragStartPositions.clear();
    // allow ground clicks after this tick
    setTimeout(() => (this.suppressGroundClick = false), 0);
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent) {
    if (!this.state.draggedNodeId()) return;
    const dragPoint = this.projectPointerToPlane(event, this.dragPlaneY) ?? this.lastDragPlanePoint;
    if (!dragPoint) return;
    this.handleDrag(dragPoint);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.xrActive) {
      this.endVrSession();
    }
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
    const snap = this.state.snapToGrid();
    selectedIds.forEach(id => {
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

  private getRenderer(): any {
    return (
      (this.cameraRef as any)?._renderer ??
      (this.cameraRef as any)?.renderer ??
      (this.engine as any)?.wegblRenderer ??
      (this.engine as any)?.webglRenderer ??
      null
    );
  }

  private patchRendererSetSize(renderer: any, disable: boolean) {
    if (!renderer) return;
    if (disable) {
      if (!renderer.__origSetSize) {
        renderer.__origSetSize = renderer.setSize;
        renderer.setSize = function (w: any, h: any, updateStyle?: any) {
          if (this.xr?.isPresenting) return this;
          return renderer.__origSetSize.call(this, w, h, updateStyle);
        };
      }
    } else if (renderer.__origSetSize) {
      renderer.setSize = renderer.__origSetSize;
      delete renderer.__origSetSize;
    }
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
      (this.cameraRef as any)?.object3d ??
      (this.cameraRef as any)?.object3D ??
      (this.cameraRef as any)?.threeObject ??
      (this.cameraRef as any)?._objRef ??
      (this.lastCamera as THREE.PerspectiveCamera | null) ??
      null;
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

  public async toggleVr() {
    if (this.xrActive) {
      await this.endVrSession();
      return;
    }
    if (!this.xrSupported) {
      this.state.statusMessage.set('WebXR not available.');
      return;
    }
    try {
      const renderer = this.getRenderer();
      if (!renderer) {
        this.state.statusMessage.set('XR renderer not available.');
        return;
      }
      this.xrRenderer = renderer;
      this.storeCameraState();
      this.applyVrSceneOffset();
      if (renderer.xr) {
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType?.('local-floor');
      }
      const session = await (navigator as any).xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor']
      });
      this.patchRendererSetSize(renderer, true);
      await renderer.xr?.setSession?.(session);
      renderer.xr.enabled = true;
      // Drive render loop through engine during XR
      renderer.setAnimationLoop?.(() => {
        const sceneObj = this.sceneRef?.object3d ?? this.sceneRef?._objRef ?? this.sceneRef?.threeObject;
        const camObj = (this.cameraRef as any)?._objRef ?? (this.cameraRef as any)?.object3d ?? (this.cameraRef as any)?.threeObject ?? this.lastCamera;
        if (sceneObj && camObj) {
          renderer.render(sceneObj, camObj);
        } else {
          this.engine.render();
        }
      });
      this.xrSession = session;
      this.xrActive = true;
      this.attachVrSelectHandler(session);
      session.addEventListener('end', () => {
        this.xrActive = false;
        this.xrSession = null;
        renderer.xr?.setSession?.(null);
        this.patchRendererSetSize(renderer, false);
        renderer.xr.enabled = false;
        renderer.setAnimationLoop?.(null);
        this.detachVrSelectHandler(session);
        this.xrRenderer = null;
        this.restoreVrSceneOffset();
        this.restoreCameraState();
        this.state.statusMessage.set('Exited VR session.');
      });
      this.state.statusMessage.set('Entered VR session.');
    } catch (err: any) {
      console.error(err);
      this.state.statusMessage.set('Failed to start VR session.');
    }
  }

  private async endVrSession() {
    let endSession: any = null;
    try {
      const renderer = this.getRenderer();
      endSession = this.xrSession || renderer?.xr?.getSession?.();
      if (endSession) {
        await endSession.end();
      } else if (renderer) {
        renderer.xr?.setSession?.(null);
        renderer.xr.enabled = false;
        renderer.setAnimationLoop?.(null);
        this.restoreCameraState();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.xrSession = null;
      this.xrActive = false;
      if (endSession) this.detachVrSelectHandler(endSession);
      this.xrRenderer = null;
      this.state.statusMessage.set('Exited VR session.');
    }
  }

  public resetView() {
    const cam: THREE.PerspectiveCamera | undefined =
      (this.cameraRef as any)?.object3d ??
      (this.cameraRef as any)?.object3D ??
      (this.cameraRef as any)?.threeObject ??
      (this.cameraRef as any)?._objRef ??
      (this.cameraRef as any)?.camera ??
      undefined;

    if (cam) {
      cam.position.copy(CAMERA_CONFIG.POSITION);
      cam.lookAt(CAMERA_CONFIG.LOOK_AT);
      cam.updateProjectionMatrix();
      this.lastCamera = cam;
    }

    const controls: any = (this.controlsRef as any)?._objRef ?? (this.controlsRef as any);
    if (controls) {
      if (controls.target?.set) {
        controls.target.set(CAMERA_CONFIG.LOOK_AT.x, CAMERA_CONFIG.LOOK_AT.y, CAMERA_CONFIG.LOOK_AT.z);
      }
      controls.update?.();
    }
  }

  private storeCameraState() {
    const cam: any =
      (this.cameraRef as any)?.object3d ??
      (this.cameraRef as any)?.object3D ??
      (this.cameraRef as any)?.threeObject ??
      (this.cameraRef as any)?._objRef ??
      (this.cameraRef as any)?.camera ??
      null;
    if (cam) {
      this.prevCameraPos = cam.position.clone();
    }
    const controls: any = (this.controlsRef as any)?._objRef ?? (this.controlsRef as any);
    if (controls?.target) {
      this.prevControlsTarget = controls.target.clone?.() ?? null;
    }
  }

  private restoreCameraState() {
    const cam: any =
      (this.cameraRef as any)?.object3d ??
      (this.cameraRef as any)?.object3D ??
      (this.cameraRef as any)?.threeObject ??
      (this.cameraRef as any)?._objRef ??
      (this.cameraRef as any)?.camera ??
      null;
    if (cam && this.prevCameraPos) {
      cam.position.copy(this.prevCameraPos);
      cam.lookAt(CAMERA_CONFIG.LOOK_AT);
      cam.updateProjectionMatrix();
    }
    const controls: any = (this.controlsRef as any)?._objRef ?? (this.controlsRef as any);
    if (controls && this.prevControlsTarget) {
      controls.target.set(this.prevControlsTarget.x, this.prevControlsTarget.y, this.prevControlsTarget.z);
      controls.update?.();
    }
  }

  private applyVrSceneOffset() {
    const nodes = this.state.allNodes();
    if (!nodes.length) return;
    const offset = this.sceneOffset();
    this.prevNodePositions = new Map();
    nodes.forEach(node => {
      this.prevNodePositions?.set(node.id, node.position.clone());
      const next = node.position.clone().add(new THREE.Vector3(offset[0], offset[1], offset[2]));
      this.state.moveNode(node.id, next);
    });
  }

  private restoreVrSceneOffset() {
    if (!this.prevNodePositions) return;
    this.prevNodePositions.forEach((pos, id) => {
      this.state.moveNode(id, pos);
    });
    this.prevNodePositions = null;
  }

  private attachVrSelectHandler(session: any) {
    if (this.xrSelectHandler) return;
    this.xrSelectHandler = () => {
      const renderer = this.xrRenderer ?? this.getRenderer();
      if (!renderer) return;
      const camObj: THREE.Camera | undefined =
        (this.cameraRef as any)?._objRef ??
        (this.cameraRef as any)?.object3d ??
        (this.cameraRef as any)?.threeObject ??
        this.lastCamera ??
        undefined;
      if (!camObj) return;
      const xrCam = renderer.xr?.getCamera?.(camObj) ?? camObj;
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3();
      xrCam.getWorldPosition(origin);
      xrCam.getWorldDirection(direction);
      this.raycaster.set(origin, direction);
      const objects = Array.from(this.nodeObjectMap.values());
      const hits = this.raycaster.intersectObjects(objects, true);
      if (!hits.length) return;
      const hit = hits[0];
      let hitObj: THREE.Object3D | null = hit.object;
      let entry: [string, THREE.Object3D] | undefined;
      while (hitObj && !entry) {
        entry = Array.from(this.nodeObjectMap.entries()).find(([, obj]) => obj === hitObj);
        hitObj = hitObj.parent ?? null;
      }
      if (!entry) return;
      const [nodeId] = entry;
      this.state.selectNode(nodeId);
      this.state.statusMessage.set(`Selected Node ${nodeId}`);
    };
    session.addEventListener('select', this.xrSelectHandler);
  }

  private detachVrSelectHandler(session: any) {
    if (!this.xrSelectHandler) return;
    session.removeEventListener('select', this.xrSelectHandler);
    this.xrSelectHandler = undefined;
  }
}
