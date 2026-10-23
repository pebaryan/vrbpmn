import {
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import {
  NgxThreeModule,
  ThPerspectiveCamera,
  ThCanvas,
  ThScene,
  ThAmbientLight,
  ThPointLight,
  ThHemisphereLight,
  ThGroup,
  ThMesh,
  ThPlaneGeometry,
  ThMeshStandardMaterial,
  ThObject3D,
  ThCylinderGeometry,
  ThBoxGeometry,
  ThRoundedBoxGeometry,
  ThSphereGeometry,
  ThOctahedronGeometry,
  ThIcosahedronGeometry,
  ThTorusGeometry,
  ThCSS2DObject,
  ThTubeGeometry,
  ThRingGeometry,
  ThMeshBasicMaterial,
  ThOrbitControls,
  ThConeGeometry,
  ThEngineService,
  ThAnimationLoopService,
  HOST_ELEMENT,
  WEBGL_RENDERER,
  provideWebGLRenderer,
  provideCSS2dRenderer
} from 'ngx-three';
import { Subscription } from 'rxjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ProcessStateService, NodeType, Node } from './process-state.service';
import {
  SCENE_CONFIG,
  CONNECTION_CONFIG,
  NODE_CONFIG,
  NODE_SIZE,
  NODE_TYPE_META,
  SUBPROCESS_CONFIG,
  ARROW_CONFIG,
  CAMERA_CONFIG,
  COLORS,
  LIGHT_CONFIG,
  GRID_CONFIG,
  BOUNDARY_HOST_TYPES,
  nodeHalfExtents,
  nodeShape
} from './process-view.constants';
import { getConnPath } from './connection-path.builder';
import { VrSessionService } from './vr-session.service';

type ResizeEdge = 'top' | 'bottom' | 'left' | 'right';
type NodeTone = 'idle' | 'hover' | 'selected' | 'source' | 'danger';

/** Minimal shape of the raycaster events emitted by ngx-three. */
interface ThPointerEvent {
  point?: THREE.Vector3;
  object?: THREE.Object3D;
}

interface ConnectionVisual {
  path: THREE.CurvePath<THREE.Vector3>;
  length: number;
  arrowPos: THREE.Vector3;
  arrowQuat: THREE.Quaternion;
  labelPos: THREE.Vector3;
}

interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
}

const ACCENT_COLORS = new Map<NodeType, THREE.Color>(
  (Object.keys(NODE_TYPE_META) as NodeType[]).map(type => [type, new THREE.Color(NODE_TYPE_META[type].accent)])
);
const SHELL_COLOR = new THREE.Color('#0b1620');
const DRAG_THRESHOLD_PX = 4;

@Component({
  selector: 'app-process-view-ngthree',
  templateUrl: './process-view-ngthree.component.html',
  styleUrls: ['./process-view-ngthree.component.scss'],
  standalone: true,
  imports: [
    NgxThreeModule,
    ThCanvas,
    ThScene,
    ThPerspectiveCamera,
    ThAmbientLight,
    ThPointLight,
    ThHemisphereLight,
    ThGroup,
    ThMesh,
    ThPlaneGeometry,
    ThMeshStandardMaterial,
    ThObject3D,
    ThCylinderGeometry,
    ThBoxGeometry,
    ThRoundedBoxGeometry,
    ThSphereGeometry,
    ThOctahedronGeometry,
    ThIcosahedronGeometry,
    ThTorusGeometry,
    ThCSS2DObject,
    ThTubeGeometry,
    ThRingGeometry,
    ThMeshBasicMaterial,
    ThOrbitControls,
    ThConeGeometry
  ],
  providers: [
    { provide: HOST_ELEMENT, useExisting: ElementRef },
    ...provideWebGLRenderer(),
    ...provideCSS2dRenderer()
  ]
})
export class ProcessViewNgThreeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('camera') private cameraRef?: ThPerspectiveCamera;
  @ViewChild('controls') private controlsRef?: ThOrbitControls;
  @ViewChild('scene') private sceneRef?: ThScene;
  @ViewChild('world') private worldRef?: ThGroup;
  @ViewChild(ThCanvas, { read: ThAnimationLoopService }) private animationLoop?: ThAnimationLoopService;
  // ThCanvas provides its own engine; injecting one here would give an instance that never renders.
  @ViewChild(ThCanvas, { read: ThEngineService }) private engine?: ThEngineService;

  // ===== Services =====
  public state = inject(ProcessStateService);
  private renderer = inject(WEBGL_RENDERER) as THREE.WebGLRenderer;
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private vrService = inject(VrSessionService);

  // ===== Template Helpers =====
  public readonly Math = Math;
  public readonly THREE = THREE;
  public readonly META = NODE_TYPE_META;
  public readonly COLORS = COLORS;
  public readonly CAMERA_CONFIG = CAMERA_CONFIG;
  public readonly LIGHT_CONFIG = LIGHT_CONFIG;
  public readonly SCENE_CONFIG = SCENE_CONFIG;
  public readonly CONNECTION_CONFIG = CONNECTION_CONFIG;
  public readonly NODE_SIZE = NODE_SIZE;
  public readonly ARROW_CONFIG = ARROW_CONFIG;
  public readonly SUBPROCESS_CONFIG = SUBPROCESS_CONFIG;
  public readonly shellColor = SHELL_COLOR;
  public readonly lookAt: [number, number, number] = [0, 0, 0];
  public readonly nodeShape = nodeShape;

  // ===== Scene Objects =====
  public readonly grid = new THREE.GridHelper(GRID_CONFIG.SIZE, GRID_CONFIG.DIVISIONS, GRID_CONFIG.COLOR_1, GRID_CONFIG.COLOR_2);
  public readonly fog = new THREE.Fog(COLORS.FOG, SCENE_CONFIG.FOG_NEAR, SCENE_CONFIG.FOG_FAR);
  public readonly linkPreview: THREE.Line;
  public readonly addCursor: THREE.Group;
  private readonly addCursorMaterial: THREE.MeshBasicMaterial;

  // ===== Interaction state =====
  public resizingNodeId = signal<string | null>(null);
  public activeResizeEdge = signal<ResizeEdge | null>(null);
  public hoveredResizeNodeId = signal<string | null>(null);
  public activeHoveredEdge = signal<ResizeEdge | null>(null);
  private resizeStartPos: THREE.Vector3 | null = null;
  private resizeStartBounds: { width: number; height: number } | null = null;
  private resizeStartNodePos: THREE.Vector3 | null = null;
  private resizeRecorded = false;

  private pointerClient: { x: number; y: number } | null = null;
  private dragStartClient: { x: number; y: number } | null = null;
  private dragStartPoint: THREE.Vector3 | null = null;
  private dragStartPositions = new Map<string, THREE.Vector3>();
  private dragActive = false;
  private dragPlaneY = 0;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private frameSub?: Subscription;
  private elapsed = 0;
  private cameraTween: CameraTween | null = null;
  private animParts = new WeakMap<THREE.Object3D, { body?: THREE.Object3D; icon?: THREE.Object3D }>();
  private subprocessFootprintCache = new Map<string, { key: string; path: THREE.CurvePath<THREE.Vector3> }>();
  private connectionCache = new Map<string, { key: string; visual: ConnectionVisual }>();
  private readonly onHostPointerDownCapture = (event: PointerEvent) => this.handleHostPointerDownCapture(event);

  public readonly xrActive = this.vrService.xrActive;

  /** Connection geometry, recomputed only for connections whose endpoints changed. */
  public readonly connectionVisuals = computed(() => {
    const nodes = this.state.allNodes();
    const byId = this.state.nodeById();
    const result = new Map<string, ConnectionVisual>();
    const live = new Set<string>();
    this.state.allConnections().forEach(conn => {
      const source = byId.get(conn.sourceId);
      const target = byId.get(conn.targetId);
      if (!source || !target) return;
      live.add(conn.id);
      const key = [
        source.position.x, source.position.z, source.type, JSON.stringify(source.bounds ?? null),
        target.position.x, target.position.z, target.type, JSON.stringify(target.bounds ?? null),
        JSON.stringify(conn.waypoints ?? null)
      ].join('|');
      const cached = this.connectionCache.get(conn.id);
      if (cached?.key === key) {
        result.set(conn.id, cached.visual);
        return;
      }
      const path = getConnPath(conn, nodes);
      const points = path.curves.length ? path.getSpacedPoints(64) : [source.position.clone(), target.position.clone()];
      const end = points[points.length - 1];
      const before = points[Math.max(0, points.length - 2)];
      const dir = end.clone().sub(before).normalize();
      const arrowQuat = new THREE.Quaternion();
      if (dir.lengthSq() > 0) arrowQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const arrowPos = end.clone().sub(dir.clone().multiplyScalar(ARROW_CONFIG.HEIGHT / 2));
      const labelPos = points[Math.floor(points.length / 2)].clone().add(new THREE.Vector3(0, 0.35, 0));
      const visual: ConnectionVisual = {
        path,
        length: Math.max(path.curves.length ? path.getLength() : 0, 0.001),
        arrowPos,
        arrowQuat,
        labelPos
      };
      this.connectionCache.set(conn.id, { key, visual });
      result.set(conn.id, visual);
    });
    this.connectionCache.forEach((_, id) => {
      if (!live.has(id)) this.connectionCache.delete(id);
    });
    return result;
  });

  /** Ids of nodes that are the current link source. */
  private readonly linkSourceId = computed(() =>
    this.state.interactionMode() === 'link' ? this.state.selectedNodeId() : null
  );

  @HostBinding('style.cursor')
  get cursor(): string {
    if (this.resizingNodeId() || this.dragActive) return 'grabbing';
    if (this.hoveredResizeNodeId()) return this.activeHoveredEdge() === 'left' || this.activeHoveredEdge() === 'right' ? 'ew-resize' : 'ns-resize';
    const hovering = !!this.state.hoveredNodeId() || !!this.state.hoveredConnectionId();
    switch (this.state.interactionMode()) {
      case 'add':
        return this.state.currentNodeType() === 'boundary' && !hovering ? 'not-allowed' : 'crosshair';
      case 'link':
        return hovering ? 'pointer' : 'crosshair';
      case 'delete':
        return hovering ? 'pointer' : 'default';
      default:
        return this.state.hoveredNodeId() ? 'grab' : 'default';
    }
  }

  constructor() {
    this.grid.position.y = SCENE_CONFIG.GROUND_Y + SCENE_CONFIG.GROUND_OFFSET;
    const gridMaterial = this.grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = SCENE_CONFIG.GRID_OPACITY;
    gridMaterial.depthWrite = false;

    const previewGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.linkPreview = new THREE.Line(
      previewGeometry,
      new THREE.LineDashedMaterial({ color: COLORS.LINK_SOURCE, dashSize: 0.3, gapSize: 0.18, transparent: true, opacity: 0.9, depthTest: false })
    );
    this.linkPreview.renderOrder = 10;
    this.linkPreview.visible = false;
    this.linkPreview.frustumCulled = false;

    this.addCursorMaterial = new THREE.MeshBasicMaterial({ color: COLORS.CYAN, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), this.addCursorMaterial);
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), this.addCursorMaterial);
    dot.rotation.x = -Math.PI / 2;
    this.addCursor = new THREE.Group();
    this.addCursor.add(ring, dot);
    this.addCursor.visible = false;

    // Re-frame the camera whenever the diagram is replaced or a frame is requested.
    effect(() => {
      const request = this.state.viewRequest();
      if (request === 0) return;
      untracked(() => setTimeout(() => this.frameAll(true)));
    });

    // Keep previews in sync with mode changes.
    effect(() => {
      const mode = this.state.interactionMode();
      const type = this.state.currentNodeType();
      this.linkSourceId();
      untracked(() => {
        if (mode !== 'add' || type === 'boundary') this.addCursor.visible = false;
        this.addCursorMaterial.color.set(NODE_TYPE_META[type].accent);
        this.updateLinkPreview();
      });
    });
  }

  ngAfterViewInit() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const engine = this.engine;
    if (!engine) return;
    engine.resize();
    this.host.nativeElement.addEventListener('pointerdown', this.onHostPointerDownCapture, { capture: true });
    this.frameSub = engine.beforeRender$.subscribe(({ delta }) => this.onFrame(delta));

    this.invertHorizontalOrbit();

    const camera = this.camera();
    const scene = this.sceneRef?.objRef as THREE.Scene | undefined;
    const world = this.worldRef?.objRef as THREE.Group | undefined;
    if (camera && scene && world) {
      this.vrService.attach({ renderer: this.renderer, camera, scene, world, engine, controls: this.controls(), loop: this.animationLoop });
    }
    this.vrService.checkSupport();
    setTimeout(() => this.frameAll(false));
  }

  ngOnDestroy() {
    this.frameSub?.unsubscribe();
    this.host.nativeElement.removeEventListener('pointerdown', this.onHostPointerDownCapture, { capture: true });
    this.vrService.detach();
    this.subprocessFootprintCache.clear();
    this.connectionCache.clear();

    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.linkPreview.geometry.dispose();
    (this.linkPreview.material as THREE.Material).dispose();
    this.addCursor.children.forEach(child => (child as THREE.Mesh).geometry.dispose());
    this.addCursorMaterial.dispose();
  }

  // ===== Accessors =====

  private camera(): THREE.PerspectiveCamera | undefined {
    return this.cameraRef?.objRef as THREE.PerspectiveCamera | undefined;
  }

  /**
   * OrbitControls swings the camera opposite to a horizontal drag; flip it so the
   * view turns the way the mouse moves. Vertical orbit is left unchanged.
   */
  private invertHorizontalOrbit() {
    const controls = this.controls() as (OrbitControls & { _rotateLeft?: (angle: number) => void }) | undefined;
    const rotateLeft = controls?._rotateLeft;
    if (!controls || !rotateLeft) return;
    controls._rotateLeft = (angle: number) => rotateLeft.call(controls, -angle);
  }

  private controls(): OrbitControls | undefined {
    return this.controlsRef?.objRef as OrbitControls | undefined;
  }

  private setOrbitEnabled(enabled: boolean) {
    const controls = this.controls();
    if (controls) controls.enabled = enabled;
  }

  // ===== Template helpers =====

  public accent(type: NodeType): THREE.Color {
    return ACCENT_COLORS.get(type)!;
  }

  public half(node: Node) {
    return nodeHalfExtents(node.type, node.bounds);
  }

  public tone(node: Node): NodeTone {
    const mode = this.state.interactionMode();
    const hovered = this.state.hoveredNodeId() === node.id;
    if (mode === 'delete' && hovered) return 'danger';
    if (this.linkSourceId() === node.id) return 'source';
    if (this.state.selectedNodeIds().includes(node.id)) return 'selected';
    if (hovered) return 'hover';
    return 'idle';
  }

  public toneColor(node: Node, tone: NodeTone): THREE.Color {
    if (tone === 'danger') return COLORS.DANGER;
    if (tone === 'source') return COLORS.LINK_SOURCE;
    return this.accent(node.type);
  }

  public toneIntensity(tone: NodeTone): number {
    switch (tone) {
      case 'idle':
        return 0.18;
      case 'hover':
        return 0.55;
      default:
        return 0.9;
    }
  }

  public nodeSubtitle(node: Node): string {
    const parts = [NODE_TYPE_META[node.type].label];
    if (node.type === 'boundary') {
      const kind = node.boundaryKind ?? 'timer';
      parts[0] = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} boundary`;
      if (node.cancelActivity === false) parts.push('non-interrupting');
    }
    if (node.multiInstance) parts.push(node.multiInstance === 'parallel' ? '∥ parallel' : '≡ sequential');
    return parts.join(' · ');
  }

  public connectionTone(connId: string): 'idle' | 'hover' | 'selected' | 'danger' {
    const hovered = this.state.hoveredConnectionId() === connId;
    if (hovered && this.state.interactionMode() === 'delete') return 'danger';
    if (this.state.selectedConnectionId() === connId) return 'selected';
    return hovered ? 'hover' : 'idle';
  }

  public subprocessFootprint(node: Node): THREE.CurvePath<THREE.Vector3> {
    const { halfW, halfD } = this.half(node);
    const radius = Math.min(halfW, halfD) * 0.24;
    const key = `${halfW.toFixed(3)}:${halfD.toFixed(3)}`;
    const cached = this.subprocessFootprintCache.get(node.id);
    if (cached?.key === key) return cached.path;

    const r = Math.min(radius, halfW, halfD);
    const shape = new THREE.Shape();
    shape.moveTo(-halfW + r, -halfD);
    shape.lineTo(halfW - r, -halfD);
    shape.absarc(halfW - r, -halfD + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(halfW, halfD - r);
    shape.absarc(halfW - r, halfD - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-halfW + r, halfD);
    shape.absarc(-halfW + r, halfD - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-halfW, -halfD + r);
    shape.absarc(-halfW + r, -halfD + r, r, Math.PI, Math.PI * 1.5, false);
    const pts = shape.getPoints(16).map(p => new THREE.Vector3(p.x, 0, p.y));
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length; i += 1) {
      const next = pts[(i + 1) % pts.length];
      if (pts[i].distanceTo(next) > 1e-5) path.add(new THREE.LineCurve3(pts[i], next));
    }
    this.subprocessFootprintCache.set(node.id, { key, path });
    return path;
  }

  public subprocessFloorY(node: Node): number {
    return CONNECTION_CONFIG.Y_POSITION - node.position.y;
  }

  public resizeHandles(node: Node): Array<{ edge: ResizeEdge; x: number; z: number }> {
    const { halfW, halfD } = this.half(node);
    return [
      { edge: 'top', x: 0, z: -halfD },
      { edge: 'bottom', x: 0, z: halfD },
      { edge: 'left', x: -halfW, z: 0 },
      { edge: 'right', x: halfW, z: 0 }
    ];
  }

  public showResizeHandles(node: Node): boolean {
    return node.type === 'subprocess'
      && this.state.interactionMode() === 'move'
      && (this.state.selectedNodeIds().includes(node.id) || this.resizingNodeId() === node.id);
  }

  public noop() {
    // Registers a click target so clicks on 3D objects don't fall through to the ground.
  }

  // ===== Frame loop =====

  private onFrame(delta: number) {
    const dt = Math.min(delta, 0.1);
    this.elapsed += dt;
    this.updateCameraTween(dt);

    const world = this.worldRef?.objRef as THREE.Group | undefined;
    if (!world) return;
    const hoveredId = this.state.hoveredNodeId();
    const visuals = this.connectionVisuals();

    for (const child of world.children) {
      const data = child.userData as { nodeId?: string; pulseFor?: string; pulseSeed?: number };
      if (data.nodeId) {
        let parts = this.animParts.get(child);
        if (!parts || (!parts.body && !parts.icon)) {
          parts = { body: child.getObjectByName('body'), icon: child.getObjectByName('icon') };
          this.animParts.set(child, parts);
        }
        if (parts.icon) parts.icon.rotation.y += dt * NODE_CONFIG.ICON_ROTATION_SPEED;
        if (parts.body) {
          const target = hoveredId === data.nodeId
            ? Math.sin(this.elapsed * NODE_CONFIG.HOVER_BOUNCE_SPEED) * NODE_CONFIG.HOVER_BOUNCE_AMPLITUDE
            : 0;
          parts.body.position.y = THREE.MathUtils.lerp(parts.body.position.y, target, 0.2);
        }
      } else if (data.pulseFor) {
        const visual = visuals.get(data.pulseFor);
        if (!visual || visual.path.curves.length === 0) continue;
        const u = ((this.elapsed * CONNECTION_CONFIG.PULSE_SPEED) / visual.length + (data.pulseSeed ?? 0)) % 1;
        child.position.copy(visual.path.getPointAt(u));
      }
    }
  }

  private updateCameraTween(dt: number) {
    const tween = this.cameraTween;
    const camera = this.camera();
    const controls = this.controls();
    if (!tween || !camera || !controls) return;
    tween.elapsed = Math.min(tween.elapsed + dt, tween.duration);
    const t = tween.elapsed / tween.duration;
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
    controls.update();
    if (t >= 1) this.cameraTween = null;
  }

  // ===== Camera =====

  /** Moves the camera so the whole diagram is in view. */
  public frameAll(animate = true) {
    if (this.xrActive()) return;
    const camera = this.camera();
    const controls = this.controls();
    if (!camera || !controls) return;

    const nodes = this.state.allNodes();
    const center = new THREE.Vector3();
    let width = 10;
    let depth = 6;
    if (nodes.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      nodes.forEach(node => {
        const { halfW, halfD } = this.half(node);
        minX = Math.min(minX, node.position.x - halfW);
        maxX = Math.max(maxX, node.position.x + halfW);
        minZ = Math.min(minZ, node.position.z - halfD);
        maxZ = Math.max(maxZ, node.position.z + halfD);
      });
      center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      width = Math.max(maxX - minX, 6);
      depth = Math.max(maxZ - minZ, 4);
    }

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = camera.aspect || 1.5;
    // Leave room for the side panels: treat the usable width as ~70% of the viewport.
    const fitHeight = Math.max(depth * 1.25, (width * 1.15) / (aspect * 0.72));
    const distance = THREE.MathUtils.clamp(fitHeight / 2 / Math.tan(vFov / 2) + 3, 10, 140);
    // Shift the view so the diagram is centred in the area left of the inspector panel.
    const visibleWidth = 2 * distance * Math.tan(vFov / 2) * aspect;
    center.x += visibleWidth * 0.09;
    const direction = new THREE.Vector3(0, 0.62, 1).normalize();
    const toPos = center.clone().add(direction.multiplyScalar(distance));

    if (!animate) {
      camera.position.copy(toPos);
      controls.target.copy(center);
      controls.update();
      this.cameraTween = null;
      return;
    }
    this.cameraTween = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget: center,
      elapsed: 0,
      duration: 0.6
    };
  }

  // ===== Pointer plumbing =====

  private handleHostPointerDownCapture(event: PointerEvent) {
    this.pointerClient = { x: event.clientX, y: event.clientY };
    // Stop orbiting before OrbitControls sees the event when the pointer is over something draggable.
    if (this.state.interactionMode() === 'move' && (this.state.hoveredNodeId() || this.hoveredResizeNodeId())) {
      this.setOrbitEnabled(false);
    }
  }

  private projectClientToPlane(client: { x: number; y: number } | null, planeY: number): THREE.Vector3 | null {
    const camera = this.camera();
    if (!client || !camera) return null;
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.ndc.set(((client.x - rect.left) / rect.width) * 2 - 1, -((client.y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  private snapValue(value: number): number {
    return Math.round(value / NODE_CONFIG.SNAP_STEP) * NODE_CONFIG.SNAP_STEP;
  }

  private snapPoint(point: THREE.Vector3): THREE.Vector3 {
    if (this.state.snapToGrid()) {
      point.x = this.snapValue(point.x);
      point.z = this.snapValue(point.z);
    }
    return point;
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent) {
    if (this.xrActive()) return;
    const overCanvas = this.host.nativeElement.contains(event.target as globalThis.Node);
    if (overCanvas || this.dragStartClient || this.resizingNodeId()) {
      this.pointerClient = { x: event.clientX, y: event.clientY };
    }

    if (this.resizingNodeId()) {
      this.onResizeEdgeMove();
      return;
    }
    if (this.state.draggedNodeId() && this.dragStartClient) {
      this.handleDrag();
      return;
    }
    this.updateAddCursor(overCanvas);
    this.updateLinkPreview();
  }

  @HostListener('window:pointerup')
  onWindowPointerUp() {
    if (this.resizingNodeId()) {
      this.onResizeEdgeUp();
    }
    if (this.state.draggedNodeId()) {
      this.finishDrag();
    }
    this.setOrbitEnabled(true);
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (this.resizingNodeId()) {
      this.cancelResize();
    } else if (this.xrActive()) {
      this.vrService.toggleVr();
    }
  }

  // ===== Nodes =====

  onNodeDown(event: ThPointerEvent, nodeId: string) {
    if (this.resizingNodeId() || this.hoveredResizeNodeId()) return;
    this.activateNode(nodeId, event, true);
  }

  onLabelPointerDown(event: PointerEvent, nodeId: string) {
    event.stopPropagation();
    if (event.button !== 0) return;
    this.pointerClient = { x: event.clientX, y: event.clientY };
    this.activateNode(nodeId, null, false, event.shiftKey);
  }

  private activateNode(nodeId: string, event: ThPointerEvent | null, allowDrag: boolean, shiftKey = this.isShiftPressed()) {
    const node = this.state.nodeById().get(nodeId);
    if (!node) return;

    switch (this.state.interactionMode()) {
      case 'move': {
        if (shiftKey) {
          this.state.toggleNodeSelection(nodeId);
          return;
        }
        const selected = this.state.selectedNodeIds();
        if (!(selected.includes(nodeId) && selected.length > 1)) {
          this.state.selectOnly(nodeId);
        }
        if (allowDrag && node.type !== 'boundary') {
          this.beginDrag(nodeId, event);
        }
        return;
      }
      case 'add': {
        if (this.state.currentNodeType() === 'boundary') {
          this.state.attachBoundary(nodeId);
        } else if (node.type === 'subprocess' && event?.point) {
          this.addNodeAt(event.point);
        } else {
          this.state.selectOnly(nodeId);
        }
        return;
      }
      default:
        // link / delete behaviour lives in the state service
        this.state.selectNode(nodeId);
    }
  }

  private isShiftPressed(): boolean {
    // ngx-three raycaster events do not carry the DOM event; window.event is the pointer event being dispatched.
    return (window.event as PointerEvent | undefined)?.shiftKey === true;
  }

  private beginDrag(nodeId: string, event: ThPointerEvent | null) {
    const node = this.state.nodeById().get(nodeId);
    if (!node) return;
    this.state.draggedNodeId.set(nodeId);
    this.setOrbitEnabled(false);
    this.dragPlaneY = node.position.y;
    this.dragStartClient = this.pointerClient ? { ...this.pointerClient } : null;
    this.dragStartPoint = this.projectClientToPlane(this.pointerClient, this.dragPlaneY)
      ?? (event?.point ? event.point.clone().setY(this.dragPlaneY) : node.position.clone());
    this.dragActive = false;
    this.dragStartPositions.clear();
    this.state.selectedNodeIds().forEach(id => {
      const selected = this.state.nodeById().get(id);
      if (selected) this.dragStartPositions.set(id, selected.position.clone());
    });
  }

  private handleDrag() {
    if (!this.dragStartPoint || !this.dragStartClient || !this.pointerClient) return;
    if (!this.dragActive) {
      const dx = this.pointerClient.x - this.dragStartClient.x;
      const dy = this.pointerClient.y - this.dragStartClient.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      this.dragActive = true;
      this.state.checkpoint();
    }
    const point = this.projectClientToPlane(this.pointerClient, this.dragPlaneY);
    if (!point) return;
    const delta = point.sub(this.dragStartPoint);
    delta.y = 0;
    this.filterDescendants(this.state.selectedNodeIds()).forEach(id => {
      const start = this.dragStartPositions.get(id);
      if (!start) return;
      const next = this.snapPoint(start.clone().add(delta));
      next.y = start.y;
      this.state.moveNode(id, next);
    });
  }

  private finishDrag() {
    if (this.dragActive) {
      // Dropping a node onto (or off) a subprocess changes its container.
      this.filterDescendants(this.state.selectedNodeIds()).forEach(id => {
        const node = this.state.nodeById().get(id);
        if (!node || node.type === 'boundary') return;
        const exclude = this.state.descendantIds(id);
        exclude.add(id);
        const container = this.state.findContainerAt(node.position.x, node.position.z, exclude);
        if (container !== (node.parentId ?? null)) this.state.setParent(id, container);
      });
    }
    this.state.endDrag();
    this.dragActive = false;
    this.dragStartClient = null;
    this.dragStartPoint = null;
    this.dragStartPositions.clear();
  }

  private filterDescendants(ids: string[]): string[] {
    if (ids.length < 2) return ids;
    const byId = this.state.nodeById();
    const selected = new Set(ids);
    return ids.filter(id => {
      let current = byId.get(id);
      for (let depth = 0; current?.parentId && depth < 64; depth += 1) {
        if (selected.has(current.parentId)) return false;
        current = byId.get(current.parentId);
      }
      return true;
    });
  }

  // ===== Ground & connections =====

  onGroundClick(event: ThPointerEvent) {
    switch (this.state.interactionMode()) {
      case 'add':
        if (this.state.currentNodeType() === 'boundary') {
          this.state.statusMessage.set('Click a task or subprocess to attach the boundary event.');
          return;
        }
        if (event.point) this.addNodeAt(event.point);
        return;
      case 'move':
        this.state.clearSelection();
        return;
      case 'link':
        if (this.state.selectedNodeId()) {
          this.state.clearSelection();
          this.state.statusMessage.set('Link cancelled.');
        }
        return;
      default:
        return;
    }
  }

  private addNodeAt(point: THREE.Vector3) {
    const position = this.snapPoint(new THREE.Vector3(point.x, 0, point.z));
    const container = this.state.findContainerAt(position.x, position.z);
    this.state.addNode(position, container);
  }

  onConnClick(connId: string) {
    if (this.state.interactionMode() === 'delete') {
      this.state.deleteConnection(connId);
      return;
    }
    this.state.selectConnection(connId);
  }

  private updateAddCursor(overCanvas: boolean) {
    const show = overCanvas
      && this.state.interactionMode() === 'add'
      && this.state.currentNodeType() !== 'boundary'
      && !this.state.hoveredNodeId();
    if (!show) {
      this.addCursor.visible = false;
      return;
    }
    const point = this.projectClientToPlane(this.pointerClient, SCENE_CONFIG.GROUND_Y);
    if (!point) {
      this.addCursor.visible = false;
      return;
    }
    this.snapPoint(point);
    this.addCursor.position.set(point.x, SCENE_CONFIG.GROUND_Y + 0.03, point.z);
    this.addCursor.visible = true;
  }

  private updateLinkPreview() {
    const sourceId = this.linkSourceId();
    const source = sourceId ? this.state.nodeById().get(sourceId) : null;
    if (!source || !this.pointerClient) {
      this.linkPreview.visible = false;
      return;
    }
    const y = CONNECTION_CONFIG.Y_POSITION;
    const hovered = this.state.hoveredNodeId();
    const hoveredNode = hovered && hovered !== sourceId ? this.state.nodeById().get(hovered) : null;
    const end = hoveredNode
      ? hoveredNode.position.clone().setY(y)
      : this.projectClientToPlane(this.pointerClient, y);
    if (!end) {
      this.linkPreview.visible = false;
      return;
    }
    const positions = this.linkPreview.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, source.position.x, y, source.position.z);
    positions.setXYZ(1, end.x, y, end.z);
    positions.needsUpdate = true;
    this.linkPreview.geometry.computeBoundingSphere();
    this.linkPreview.computeLineDistances();
    this.linkPreview.visible = true;
  }

  // ===== Subprocess resizing =====

  onResizeHandleHover(nodeId: string, edge: ResizeEdge, isHovering: boolean) {
    if (isHovering) {
      this.hoveredResizeNodeId.set(nodeId);
      this.activeHoveredEdge.set(edge);
    } else if (this.hoveredResizeNodeId() === nodeId && this.activeHoveredEdge() === edge) {
      this.hoveredResizeNodeId.set(null);
      this.activeHoveredEdge.set(null);
    }
  }

  onResizeEdgeDown(nodeId: string, edge: ResizeEdge) {
    const node = this.state.nodeById().get(nodeId);
    if (!node || node.type !== 'subprocess') return;
    this.setOrbitEnabled(false);
    this.state.endDrag();
    this.resizingNodeId.set(nodeId);
    this.activeResizeEdge.set(edge);
    this.resizeStartPos = this.projectClientToPlane(this.pointerClient, CONNECTION_CONFIG.Y_POSITION);
    this.resizeStartBounds = {
      width: node.bounds?.width ?? SUBPROCESS_CONFIG.DEFAULT_WIDTH,
      height: node.bounds?.height ?? SUBPROCESS_CONFIG.DEFAULT_DEPTH
    };
    this.resizeStartNodePos = node.position.clone();
    this.resizeRecorded = false;
    this.state.statusMessage.set('Resizing subprocess… Press Esc to cancel.');
  }

  private getSubprocessMinSize(node: Node): { width: number; depth: number } {
    const children = this.state.allNodes().filter(n => n.parentId === node.id && n.type !== 'boundary');
    if (!children.length) return { width: SUBPROCESS_CONFIG.MIN_SIZE, depth: SUBPROCESS_CONFIG.MIN_SIZE };
    let maxX = 0;
    let maxZ = 0;
    children.forEach(child => {
      const { halfW, halfD } = this.half(child);
      maxX = Math.max(maxX, Math.abs(child.position.x - node.position.x) + halfW);
      maxZ = Math.max(maxZ, Math.abs(child.position.z - node.position.z) + halfD);
    });
    const pad = SUBPROCESS_CONFIG.PADDING / SUBPROCESS_CONFIG.SHELL_SCALE;
    return {
      width: Math.max(SUBPROCESS_CONFIG.MIN_SIZE, (2 * maxX) / SUBPROCESS_CONFIG.SHELL_SCALE + pad),
      depth: Math.max(SUBPROCESS_CONFIG.MIN_SIZE, (2 * maxZ) / SUBPROCESS_CONFIG.SHELL_SCALE + pad)
    };
  }

  private onResizeEdgeMove() {
    const nodeId = this.resizingNodeId();
    const edge = this.activeResizeEdge();
    if (!nodeId || !edge || !this.resizeStartPos || !this.resizeStartBounds || !this.resizeStartNodePos) return;
    const currentPos = this.projectClientToPlane(this.pointerClient, CONNECTION_CONFIG.Y_POSITION);
    const node = this.state.nodeById().get(nodeId);
    if (!currentPos || !node) return;

    if (!this.resizeRecorded) {
      this.state.checkpoint();
      this.resizeRecorded = true;
    }

    // Edges move symmetrically around the subprocess centre, so the opposite edge stays put
    // only after the centre is shifted by half the size change.
    const scale = SUBPROCESS_CONFIG.SHELL_SCALE;
    const deltaX = (currentPos.x - this.resizeStartPos.x) / scale;
    const deltaZ = (currentPos.z - this.resizeStartPos.z) / scale;
    const minSize = this.getSubprocessMinSize(node);
    let newWidth = this.resizeStartBounds.width;
    let newDepth = this.resizeStartBounds.height;
    let offsetX = 0;
    let offsetZ = 0;

    if (edge === 'left') {
      newWidth = Math.max(minSize.width, this.resizeStartBounds.width - deltaX);
      offsetX = -((newWidth - this.resizeStartBounds.width) / 2) * scale;
    } else if (edge === 'right') {
      newWidth = Math.max(minSize.width, this.resizeStartBounds.width + deltaX);
      offsetX = ((newWidth - this.resizeStartBounds.width) / 2) * scale;
    } else if (edge === 'top') {
      newDepth = Math.max(minSize.depth, this.resizeStartBounds.height - deltaZ);
      offsetZ = -((newDepth - this.resizeStartBounds.height) / 2) * scale;
    } else {
      newDepth = Math.max(minSize.depth, this.resizeStartBounds.height + deltaZ);
      offsetZ = ((newDepth - this.resizeStartBounds.height) / 2) * scale;
    }

    this.state.resizeSubprocessBounds(nodeId, newWidth, newDepth, 0, 0);
    // Move only the subprocess shell; children keep their absolute positions.
    const target = this.resizeStartNodePos.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));
    if (!target.equals(node.position)) {
      this.state.moveNode(nodeId, target, false);
    }
  }

  private onResizeEdgeUp() {
    if (this.resizingNodeId()) this.state.statusMessage.set('Subprocess resized.');
    this.clearResize();
  }

  cancelResize() {
    if (this.resizingNodeId() && this.resizeRecorded) {
      this.state.undo();
    }
    this.state.statusMessage.set('Resize cancelled.');
    this.clearResize();
  }

  private clearResize() {
    this.resizingNodeId.set(null);
    this.activeResizeEdge.set(null);
    this.resizeStartPos = null;
    this.resizeStartBounds = null;
    this.resizeStartNodePos = null;
    this.resizeRecorded = false;
    this.setOrbitEnabled(true);
  }

  // ===== Template bindings for hovering =====

  isHandleHovered(nodeId: string, edge: ResizeEdge): boolean {
    return this.hoveredResizeNodeId() === nodeId && this.activeHoveredEdge() === edge;
  }

  public isBoundaryHost(node: Node): boolean {
    return BOUNDARY_HOST_TYPES.has(node.type);
  }
}
