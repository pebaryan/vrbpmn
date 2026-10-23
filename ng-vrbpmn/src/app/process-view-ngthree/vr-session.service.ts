import { Injectable, inject, signal } from '@angular/core';
import { ThAnimationLoopService, ThEngineService } from 'ngx-three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InteractionMode, Node, NodeType, ProcessStateService } from './process-state.service';
import { NODE_CONFIG, NODE_TYPE_META, PALETTE_GROUPS, nodeHalfExtents } from './process-view.constants';

export interface VrContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  /** Group that contains the whole diagram; VR moves/scales/rotates it instead of the nodes. */
  world: THREE.Group;
  engine: ThEngineService;
  controls?: OrbitControls;
  loop?: ThAnimationLoopService;
}

type VrHit =
  | { kind: 'node'; nodeId: string; point: THREE.Vector3; distance: number }
  | { kind: 'ground'; point: THREE.Vector3; distance: number };

interface ControllerState {
  controller: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  ray: THREE.Line;
  input: XRInputSource | null;
  hit: VrHit | null;
  grabbedNodeId: string | null;
  grabOffset: THREE.Vector3;
  grabPlaneY: number;
  grabMoved: boolean;
  prevButtons: boolean[];
  turnArmed: boolean;
  listeners: Array<[string, (event: any) => void]>;
}

const MODES: InteractionMode[] = ['move', 'add', 'link', 'delete'];
const PALETTE: NodeType[] = PALETTE_GROUPS.flatMap(group => group.types);
const MOVE_SPEED = 2.2; // metres per second
const SNAP_TURN = Math.PI / 6;
const DIAGRAM_EYE_LEVEL = 1.1;
const RAY_LENGTH = 6;

@Injectable({ providedIn: 'root' })
export class VrSessionService {
  private state = inject(ProcessStateService);

  readonly xrSupported = signal<boolean | null>(null);
  readonly xrActive = signal(false);

  private ctx: VrContext | null = null;
  private session: XRSession | null = null;
  private controllers: ControllerState[] = [];
  private raycaster = new THREE.Raycaster();
  private lastTime = 0;
  private savedCamera: { position: THREE.Vector3; target: THREE.Vector3 | null } | null = null;

  private labelGroup: THREE.Group | null = null;
  private labels = new Map<string, { sprite: THREE.Sprite; key: string; texture: THREE.CanvasTexture }>();
  private hud: { mesh: THREE.Mesh; texture: THREE.CanvasTexture; key: string } | null = null;
  private teleportMarker: THREE.Mesh | null = null;

  attach(ctx: VrContext) {
    this.ctx = ctx;
  }

  detach() {
    if (this.session) {
      this.session.end().catch(() => undefined);
    }
    this.ctx = null;
  }

  async checkSupport() {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) {
      this.xrSupported.set(false);
      return;
    }
    try {
      this.xrSupported.set(await xr.isSessionSupported('immersive-vr'));
    } catch {
      this.xrSupported.set(false);
    }
  }

  async toggleVr() {
    if (this.session) {
      await this.session.end().catch(() => undefined);
      return;
    }
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!this.xrSupported() || !xr) {
      this.state.statusMessage.set('WebXR is not available on this device.');
      return;
    }
    const ctx = this.ctx;
    if (!ctx) {
      this.state.statusMessage.set('The 3D scene is not ready yet.');
      return;
    }

    try {
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      this.session = session;
      this.saveCameraState();
      ctx.loop?.stop();
      if (ctx.controls) ctx.controls.enabled = false;

      ctx.renderer.xr.enabled = true;
      ctx.renderer.xr.setReferenceSpaceType('local-floor');
      await ctx.renderer.xr.setSession(session);

      this.layoutWorld();
      this.setupControllers();
      this.createTeleportMarker();
      this.labelGroup = new THREE.Group();
      this.labelGroup.name = 'vr-labels';
      ctx.world.add(this.labelGroup);
      this.createHud();

      session.addEventListener('end', () => this.onSessionEnd());
      this.lastTime = 0;
      ctx.renderer.setAnimationLoop(time => this.onXrFrame(time));

      this.xrActive.set(true);
      this.state.statusMessage.set('Entered VR. Trigger: select / drag · Squeeze: teleport · A/X: mode · B/Y: element type.');
    } catch (err) {
      console.error(err);
      this.session = null;
      this.restoreDesktop();
      this.state.statusMessage.set('Failed to start VR session.');
    }
  }

  // ── Session lifecycle ──

  private onSessionEnd() {
    this.session = null;
    this.restoreDesktop();
    this.state.statusMessage.set('Exited VR session.');
  }

  private restoreDesktop() {
    const ctx = this.ctx;
    this.xrActive.set(false);
    this.teardownControllers();
    this.disposeLabels();
    this.disposeHud();
    if (this.teleportMarker) {
      this.teleportMarker.removeFromParent();
      this.teleportMarker.geometry.dispose();
      (this.teleportMarker.material as THREE.Material).dispose();
      this.teleportMarker = null;
    }
    if (!ctx) return;
    ctx.renderer.setAnimationLoop(null);
    ctx.renderer.xr.enabled = false;
    ctx.world.position.set(0, 0, 0);
    ctx.world.quaternion.identity();
    ctx.world.scale.setScalar(1);
    this.restoreCameraState();
    if (ctx.controls) ctx.controls.enabled = true;
    ctx.engine.resize();
    ctx.loop?.start();
  }

  private saveCameraState() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.savedCamera = {
      position: ctx.camera.position.clone(),
      target: ctx.controls?.target.clone() ?? null
    };
  }

  private restoreCameraState() {
    const ctx = this.ctx;
    if (!ctx || !this.savedCamera) return;
    ctx.camera.position.copy(this.savedCamera.position);
    if (ctx.controls && this.savedCamera.target) {
      ctx.controls.target.copy(this.savedCamera.target);
      ctx.controls.update();
    } else {
      ctx.camera.lookAt(0, 0, 0);
    }
    this.savedCamera = null;
  }

  /** Places the diagram in front of the user at roughly table height, scaled to fit. */
  private layoutWorld() {
    const ctx = this.ctx;
    if (!ctx) return;
    const nodes = this.state.allNodes();
    let minX = -3, maxX = 3, minZ = -2, maxZ = 2;
    if (nodes.length) {
      minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
      nodes.forEach(node => {
        const { halfW, halfD } = nodeHalfExtents(node.type, node.bounds);
        minX = Math.min(minX, node.position.x - halfW);
        maxX = Math.max(maxX, node.position.x + halfW);
        minZ = Math.min(minZ, node.position.z - halfD);
        maxZ = Math.max(maxZ, node.position.z + halfD);
      });
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const scale = THREE.MathUtils.clamp(4 / Math.max(width, depth, 1), 0.15, 0.5);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    ctx.world.quaternion.identity();
    ctx.world.scale.setScalar(scale);
    ctx.world.position.set(-cx * scale, DIAGRAM_EYE_LEVEL, -cz * scale - (depth * scale) / 2 - 0.8);
  }

  // ── Controllers ──

  private setupControllers() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.teardownControllers();
    for (let i = 0; i < 2; i += 1) {
      const controller = ctx.renderer.xr.getController(i);
      const grip = ctx.renderer.xr.getControllerGrip(i);

      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.8 })
      );
      ray.name = 'vr-ray';
      ray.scale.z = RAY_LENGTH;
      controller.add(ray);

      const gripMarker = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x0b2630, wireframe: true })
      );
      gripMarker.name = 'vr-grip-marker';
      grip.add(gripMarker);

      ctx.scene.add(controller, grip);

      const state: ControllerState = {
        controller,
        grip,
        ray,
        input: null,
        hit: null,
        grabbedNodeId: null,
        grabOffset: new THREE.Vector3(),
        grabPlaneY: 0,
        grabMoved: false,
        prevButtons: [],
        turnArmed: true,
        listeners: []
      };
      const listen = (type: string, handler: (event: any) => void) => {
        controller.addEventListener(type as any, handler);
        state.listeners.push([type, handler]);
      };
      listen('connected', (event: { data: XRInputSource }) => {
        state.input = event.data;
      });
      listen('disconnected', () => {
        state.input = null;
        state.grabbedNodeId = null;
      });
      listen('selectstart', () => this.onSelectStart(state));
      listen('selectend', () => this.onSelectEnd(state));
      listen('squeezestart', () => this.onSqueezeStart(state));
      this.controllers.push(state);
    }
  }

  private teardownControllers() {
    this.controllers.forEach(state => {
      state.listeners.forEach(([type, handler]) => state.controller.removeEventListener(type as any, handler));
      [state.ray, state.grip.getObjectByName('vr-grip-marker')].forEach(obj => {
        if (!obj) return;
        obj.removeFromParent();
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose();
      });
      state.controller.removeFromParent();
      state.grip.removeFromParent();
    });
    this.controllers = [];
  }

  private nodeGroups(): THREE.Object3D[] {
    return this.ctx?.world.children.filter(child => !!child.userData['nodeId']) ?? [];
  }

  private pick(state: ControllerState): VrHit | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    this.raycaster.setFromXRController(state.controller);
    this.raycaster.far = 50;

    const nodeHit = this.raycaster.intersectObjects(this.nodeGroups(), true)[0];
    if (nodeHit) {
      let obj: THREE.Object3D | null = nodeHit.object;
      while (obj && !obj.userData['nodeId']) obj = obj.parent;
      if (obj) {
        return { kind: 'node', nodeId: obj.userData['nodeId'], point: nodeHit.point.clone(), distance: nodeHit.distance };
      }
    }
    const ground = ctx.world.getObjectByName('ground');
    const groundHit = ground ? this.raycaster.intersectObject(ground, false)[0] : undefined;
    if (groundHit) {
      return { kind: 'ground', point: groundHit.point.clone(), distance: groundHit.distance };
    }
    return null;
  }

  /** Intersects a controller ray with a horizontal plane expressed in world-group (diagram) coordinates. */
  private rayToLocalPlane(state: ControllerState, planeY: number): THREE.Vector3 | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    this.raycaster.setFromXRController(state.controller);
    const inverse = ctx.world.matrixWorld.clone().invert();
    const localRay = this.raycaster.ray.clone().applyMatrix4(inverse);
    const hit = new THREE.Vector3();
    return localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), hit) ? hit : null;
  }

  private toLocal(point: THREE.Vector3): THREE.Vector3 {
    return this.ctx ? this.ctx.world.worldToLocal(point.clone()) : point.clone();
  }

  private snap(point: THREE.Vector3): THREE.Vector3 {
    if (this.state.snapToGrid()) {
      point.x = Math.round(point.x / NODE_CONFIG.SNAP_STEP) * NODE_CONFIG.SNAP_STEP;
      point.z = Math.round(point.z / NODE_CONFIG.SNAP_STEP) * NODE_CONFIG.SNAP_STEP;
    }
    return point;
  }

  private onSelectStart(state: ControllerState) {
    const hit = this.pick(state);
    const mode = this.state.interactionMode();
    if (hit?.kind === 'node') {
      const node = this.state.nodeById().get(hit.nodeId);
      if (!node) return;
      if (mode === 'move') {
        this.state.selectOnly(node.id);
        if (node.type !== 'boundary') this.beginGrab(state, node);
      } else if (mode === 'add') {
        if (this.state.currentNodeType() === 'boundary') {
          this.state.attachBoundary(node.id);
        } else if (node.type === 'subprocess') {
          this.addAt(this.toLocal(hit.point));
        } else {
          this.state.selectOnly(node.id);
        }
      } else {
        this.state.selectNode(node.id);
      }
      return;
    }
    if (hit?.kind === 'ground') {
      if (mode === 'add') {
        if (this.state.currentNodeType() === 'boundary') {
          this.state.statusMessage.set('Point at a task or subprocess to attach the boundary event.');
        } else {
          this.addAt(this.toLocal(hit.point));
        }
      } else if (mode === 'move' || mode === 'link') {
        this.state.clearSelection();
      }
    }
  }

  private addAt(local: THREE.Vector3) {
    const position = this.snap(new THREE.Vector3(local.x, 0, local.z));
    this.state.addNode(position, this.state.findContainerAt(position.x, position.z));
  }

  private beginGrab(state: ControllerState, node: Node) {
    const planePoint = this.rayToLocalPlane(state, node.position.y);
    state.grabbedNodeId = node.id;
    state.grabPlaneY = node.position.y;
    state.grabOffset = planePoint ? node.position.clone().sub(planePoint) : new THREE.Vector3();
    state.grabMoved = false;
  }

  private updateGrab(state: ControllerState) {
    if (!state.grabbedNodeId) return;
    const node = this.state.nodeById().get(state.grabbedNodeId);
    const planePoint = this.rayToLocalPlane(state, state.grabPlaneY);
    if (!node || !planePoint) return;
    const next = this.snap(planePoint.add(state.grabOffset));
    next.y = node.position.y;
    if (next.distanceToSquared(node.position) < 1e-6) return;
    if (!state.grabMoved) {
      this.state.checkpoint();
      state.grabMoved = true;
    }
    this.state.moveNode(node.id, next);
  }

  private onSelectEnd(state: ControllerState) {
    const id = state.grabbedNodeId;
    state.grabbedNodeId = null;
    if (!id || !state.grabMoved) return;
    const node = this.state.nodeById().get(id);
    if (!node) return;
    const exclude = this.state.descendantIds(id);
    exclude.add(id);
    const container = this.state.findContainerAt(node.position.x, node.position.z, exclude);
    if (container !== (node.parentId ?? null)) this.state.setParent(id, container);
  }

  private onSqueezeStart(state: ControllerState) {
    const ctx = this.ctx;
    const hit = this.pick(state);
    if (!ctx || hit?.kind !== 'ground') return;
    const head = this.headPosition();
    ctx.world.position.x -= hit.point.x - head.x;
    ctx.world.position.z -= hit.point.z - head.z;
  }

  private headPosition(): THREE.Vector3 {
    const ctx = this.ctx!;
    const xrCamera = ctx.renderer.xr.getCamera();
    return new THREE.Vector3().setFromMatrixPosition(xrCamera.matrixWorld);
  }

  private createTeleportMarker() {
    const ctx = this.ctx;
    if (!ctx) return;
    const geometry = new THREE.RingGeometry(0.18, 0.24, 32);
    geometry.rotateX(-Math.PI / 2);
    this.teleportMarker = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.7, depthTest: false })
    );
    this.teleportMarker.renderOrder = 999;
    this.teleportMarker.visible = false;
    ctx.scene.add(this.teleportMarker);
  }

  // ── Per-frame update ──

  private onXrFrame(time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = time;

    let hoveredNode: string | null = null;
    let groundHit: THREE.Vector3 | null = null;
    for (const state of this.controllers) {
      if (!state.input) {
        state.ray.visible = false;
        continue;
      }
      state.ray.visible = true;
      state.hit = this.pick(state);
      state.ray.scale.z = state.hit?.distance ?? RAY_LENGTH;
      if (state.hit?.kind === 'node') hoveredNode ??= state.hit.nodeId;
      if (state.hit?.kind === 'ground' && !groundHit) groundHit = state.hit.point;
      this.updateGrab(state);
      this.handleGamepad(state, dt);
    }

    if (hoveredNode !== this.state.hoveredNodeId()) this.state.hoveredNodeId.set(hoveredNode);
    if (this.teleportMarker) {
      this.teleportMarker.visible = !!groundHit;
      if (groundHit) this.teleportMarker.position.copy(groundHit).add(new THREE.Vector3(0, 0.01, 0));
    }

    this.syncLabels();
    this.updateHud();
    ctx.engine.render();
  }

  private handleGamepad(state: ControllerState, dt: number) {
    const ctx = this.ctx;
    const gamepad = state.input?.gamepad;
    if (!ctx || !gamepad) return;

    const axisX = gamepad.axes[2] ?? gamepad.axes[0] ?? 0;
    const axisY = gamepad.axes[3] ?? gamepad.axes[1] ?? 0;
    const handedness = state.input?.handedness ?? 'none';

    if (handedness === 'right') {
      // Snap turn around the user's head.
      if (state.turnArmed && Math.abs(axisX) > 0.7) {
        const angle = -Math.sign(axisX) * SNAP_TURN;
        const head = this.headPosition();
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        ctx.world.position.sub(head).applyQuaternion(q).add(head);
        ctx.world.quaternion.premultiply(q);
        state.turnArmed = false;
      } else if (Math.abs(axisX) < 0.3) {
        state.turnArmed = true;
      }
    } else if (Math.abs(axisX) > 0.15 || Math.abs(axisY) > 0.15) {
      // Smooth locomotion: move the world opposite to the user's intended direction.
      const xrCamera = ctx.renderer.xr.getCamera();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCamera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const move = forward.multiplyScalar(-axisY).add(right.multiplyScalar(axisX));
      ctx.world.position.addScaledVector(move, -MOVE_SPEED * dt);
    }

    // A/X (button 4) cycles the tool mode; B/Y (button 5) cycles the element type.
    const pressed = gamepad.buttons.map(button => button.pressed);
    if (pressed[4] && !state.prevButtons[4]) {
      const next = MODES[(MODES.indexOf(this.state.interactionMode()) + 1) % MODES.length];
      this.state.setMode(next);
    }
    if (pressed[5] && !state.prevButtons[5]) {
      const next = PALETTE[(PALETTE.indexOf(this.state.currentNodeType()) + 1) % PALETTE.length];
      if (this.state.interactionMode() !== 'add') this.state.setMode('add');
      this.state.setNodeType(next);
    }
    state.prevButtons = pressed;
  }

  // ── VR labels (CSS labels are not rendered inside an XR session) ──

  private syncLabels() {
    const group = this.labelGroup;
    if (!group) return;
    const nodes = this.state.allNodes();
    const selected = new Set(this.state.selectedNodeIds());
    const hovered = this.state.hoveredNodeId();
    const live = new Set<string>();
    nodes.forEach(node => {
      live.add(node.id);
      const state = selected.has(node.id) ? 'selected' : hovered === node.id ? 'hover' : 'idle';
      const key = `${node.name}|${node.type}|${state}`;
      let entry = this.labels.get(node.id);
      if (!entry) {
        const texture = new THREE.CanvasTexture(document.createElement('canvas'));
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        sprite.renderOrder = 20;
        group.add(sprite);
        entry = { sprite, texture, key: '' };
        this.labels.set(node.id, entry);
      }
      if (entry.key !== key) {
        this.drawLabel(entry.texture, node, state);
        entry.key = key;
      }
      const { halfH } = nodeHalfExtents(node.type, node.bounds);
      entry.sprite.position.set(node.position.x, node.position.y + halfH + 0.7, node.position.z);
      entry.sprite.scale.set(2.8, 0.7, 1);
    });
    this.labels.forEach((entry, id) => {
      if (live.has(id)) return;
      entry.sprite.removeFromParent();
      entry.texture.dispose();
      entry.sprite.material.dispose();
      this.labels.delete(id);
    });
  }

  private drawLabel(texture: THREE.CanvasTexture, node: Node, state: 'idle' | 'hover' | 'selected') {
    const canvas = texture.image as HTMLCanvasElement;
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    const accent = NODE_TYPE_META[node.type].accent;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = state === 'selected' ? 'rgba(0, 60, 70, 0.92)' : 'rgba(6, 14, 20, 0.82)';
    g.strokeStyle = state === 'idle' ? `${accent}88` : accent;
    g.lineWidth = state === 'idle' ? 3 : 6;
    g.beginPath();
    g.roundRect(6, 6, 500, 116, 18);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#e6fbff';
    g.font = '600 40px system-ui, sans-serif';
    g.fillText(this.truncate(g, node.name, 470), 256, 62);
    g.fillStyle = accent;
    g.font = '24px system-ui, sans-serif';
    g.fillText(NODE_TYPE_META[node.type].label.toUpperCase(), 256, 100);
    texture.needsUpdate = true;
  }

  private truncate(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (g.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && g.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
    return `${result}…`;
  }

  private disposeLabels() {
    this.labels.forEach(entry => {
      entry.sprite.removeFromParent();
      entry.texture.dispose();
      entry.sprite.material.dispose();
    });
    this.labels.clear();
    this.labelGroup?.removeFromParent();
    this.labelGroup = null;
  }

  // ── Wrist HUD showing the current tool ──

  private createHud() {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.075),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
    );
    mesh.renderOrder = 1000;
    mesh.position.set(0, 0.07, 0.02);
    mesh.rotation.x = -Math.PI / 4;
    this.hud = { mesh, texture, key: '' };
  }

  private updateHud() {
    const hud = this.hud;
    if (!hud) return;
    // Attach to the left controller's grip when known, otherwise the first one.
    const owner = this.controllers.find(c => c.input?.handedness === 'left') ?? this.controllers.find(c => c.input);
    if (owner && hud.mesh.parent !== owner.grip) owner.grip.add(hud.mesh);

    const mode = this.state.interactionMode();
    const detail = mode === 'add'
      ? NODE_TYPE_META[this.state.currentNodeType()].label
      : this.state.selectedNode()?.name ?? 'A/X mode · B/Y type';
    const key = `${mode}|${detail}`;
    if (key === hud.key) return;
    hud.key = key;

    const canvas = hud.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(4, 12, 18, 0.88)';
    g.strokeStyle = mode === 'delete' ? '#ff4b6e' : '#00f2ff';
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(6, 6, 500, 180, 22);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = mode === 'delete' ? '#ff4b6e' : '#00f2ff';
    g.font = '700 64px system-ui, sans-serif';
    g.fillText(mode.toUpperCase(), 256, 86);
    g.fillStyle = '#e6fbff';
    g.font = '34px system-ui, sans-serif';
    g.fillText(this.truncate(g, detail, 470), 256, 148);
    hud.texture.needsUpdate = true;
  }

  private disposeHud() {
    if (!this.hud) return;
    this.hud.mesh.removeFromParent();
    this.hud.mesh.geometry.dispose();
    (this.hud.mesh.material as THREE.Material).dispose();
    this.hud.texture.dispose();
    this.hud = null;
  }
}
