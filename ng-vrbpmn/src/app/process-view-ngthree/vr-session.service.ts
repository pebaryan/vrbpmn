import { Injectable, inject, signal } from '@angular/core';
import { ProcessStateService } from './process-state.service';
import { ThEngineService } from 'ngx-three';
import { ChangeDetectorRef } from '@angular/core';
import * as THREE from 'three';
import { CAMERA_CONFIG } from './process-view.constants';

@Injectable({ providedIn: 'root' })
export class VrSessionService {
  private processState = inject(ProcessStateService);

  private cameraRef: any = null;
  private controlsRef: any = null;
  private rendererRef: any = null;
  private sceneRef: any = null;
  private nodeObjectMap = new Map<string, THREE.Object3D>();
  private engineRef: any = null;
  private cdrRef: ChangeDetectorRef | null = null;
  private onNodeSelected: ((nodeId: string | null) => void) | null = null;
  private onVrSessionEnd: (() => void) | null = null;

  xrActive = signal(false);
  xrSupported: boolean | null = null;

  private xrSession: any = null;
  private xrRenderer: any = null;
  private xrSelectHandler: ((event: any) => void) | undefined;
  private lastCamera: THREE.Camera | null = null;

  private prevCameraPos: THREE.Vector3 | null = null;
  private prevControlsTarget: THREE.Vector3 | null = null;
  private prevNodePositions: Map<string, THREE.Vector3> | null = null;

  private rigGroup: THREE.Group | null = null;
  private teleportMarker: THREE.Mesh | null = null;
  private readonly TELEPORT_RANGE = 20;
  private readonly MOVE_SPEED = 3;
  private readonly SNAP_TURN_ANGLE = Math.PI / 4;
  private lastSnapTurnTime = 0;
  private readonly SNAP_TURN_COOLDOWN = 300;

  setReferences(cameraRef: any, controlsRef: any, rendererRef: any, sceneRef: any, engineRef: any, cdrRef: ChangeDetectorRef) {
    this.cameraRef = cameraRef;
    this.controlsRef = controlsRef;
    this.rendererRef = rendererRef;
    this.sceneRef = sceneRef;
    this.engineRef = engineRef;
    this.cdrRef = cdrRef;
  }

  setNodeObjectMap(nodeObjectMap: Map<string, THREE.Object3D>) {
    this.nodeObjectMap = nodeObjectMap;
  }

  setOnNodeSelected(callback: (nodeId: string | null) => void) {
    this.onNodeSelected = callback;
  }

  setOnVrSessionEnd(callback: () => void) {
    this.onVrSessionEnd = callback;
  }

  async checkSupport() {
    if (!('xr' in navigator)) {
      this.xrSupported = false;
      return;
    }
    try {
      const supported = await (navigator as any).xr?.isSessionSupported?.('immersive-vr');
      this.xrSupported = !!supported;
      this.cdrRef?.markForCheck();
    } catch {
      this.xrSupported = false;
      this.cdrRef?.markForCheck();
    }
  }

  async toggleVr() {
    if (this.xrActive()) {
      await this.endVrSession();
      return;
    }

    if (!this.xrSupported) {
      this.processState.statusMessage.set('WebXR not available.');
      return;
    }

    try {
      const renderer = this.getRenderer();
      if (!renderer) {
        this.processState.statusMessage.set('XR renderer not available.');
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
        optionalFeatures: ['local-floor', 'bounded-floor']
      });

      this.patchRendererSetSize(renderer, true);
      await renderer.xr?.setSession?.(session);
      renderer.xr.enabled = true;

      this.createTeleportMarker();
      this.setupLocomotionControllers(session);

      renderer.setAnimationLoop?.((time: number) => {
        this.updateLocomotion(time);
        const sceneObj = this.sceneRef?.object3d ?? this.sceneRef?._objRef ?? this.sceneRef?.threeObject;
        const camObj = (this.cameraRef as any)?._objRef ?? (this.cameraRef as any)?.object3d ?? (this.cameraRef as any)?.threeObject ?? this.lastCamera;
        if (sceneObj && camObj) {
          renderer.render(sceneObj, camObj);
        } else {
          this.engineRef.render();
        }
      });

      this.xrSession = session;
      this.xrActive.set(true);
      this.attachVrSelectHandler(session);

      session.addEventListener('end', () => {
        this.xrActive.set(false);
        this.xrSession = null;
        this.cleanupLocomotion();
        renderer.xr?.setSession?.(null);
        this.patchRendererSetSize(renderer, false);
        renderer.xr.enabled = false;
        renderer.setAnimationLoop?.(null);
        this.detachVrSelectHandler(session);
        this.xrRenderer = null;
        this.restoreVrSceneOffset();
        this.restoreCameraState();
        this.processState.statusMessage.set('Exited VR session.');
        this.onVrSessionEnd?.();
        this.cdrRef?.markForCheck();
      });

      this.processState.statusMessage.set('Entered VR. Thumbstick: move/turn. Squeeze: teleport. Trigger: select nodes for details.');
      this.cdrRef?.markForCheck();
    } catch (err: any) {
      console.error(err);
      this.processState.statusMessage.set('Failed to start VR session.');
    }
  }

  private createTeleportMarker() {
    const geometry = new THREE.RingGeometry(0.3, 0.4, 32);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.7,
      depthTest: false
    });
    this.teleportMarker = new THREE.Mesh(geometry, material);
    this.teleportMarker.visible = false;
    this.teleportMarker.renderOrder = 999;

    const sceneObj = this.sceneRef?.object3d ?? this.sceneRef?._objRef ?? this.sceneRef?.threeObject;
    if (sceneObj) {
      sceneObj.add(this.teleportMarker);
    }
  }

  private setupLocomotionControllers(session: any) {
    session.addEventListener('inputsourceschange', () => {
      this.updateControllerTargets();
    });
    this.updateControllerTargets();
  }

  private updateControllerTargets() {
    if (!this.xrRenderer?.xr) return;

    const sources = this.xrRenderer.xr.getControllerGrips();
    const inputSources = this.xrRenderer.xr.getInputSources();

    for (let i = 0; i < sources.length; i++) {
      const grip = sources[i];
      const input = inputSources?.[i];

      if (grip && input) {
        grip.addEventListener('selectstart', () => this.onTeleportSelect(true));
        grip.addEventListener('selectend', () => this.onTeleportSelect(false));
        grip.addEventListener('squeezestart', () => this.executeTeleport());
      }
    }
  }

  private teleportController: THREE.Object3D | null = null;
  private isTeleportActive = false;

  private onTeleportSelect(active: boolean) {
    if (active) {
      this.isTeleportActive = true;
    }
  }

  private executeTeleport() {
    if (!this.teleportMarker?.visible || !this.rigGroup) return;

    const targetPos = this.teleportMarker.position.clone();
    this.rigGroup.position.set(targetPos.x, 0, targetPos.z);
    this.processState.statusMessage.set('Teleported');
  }

  private updateLocomotion(time: number) {
    if (!this.xrRenderer?.xr || !this.rigGroup) {
      this.updateRigReference();
    }

    const inputSources = this.xrRenderer.xr.getInputSources();
    if (!inputSources) return;

    for (const input of inputSources) {
      if (!input.gamepad) continue;

      const axes = input.gamepad.axes;
      const thumbstickX = axes[2] ?? axes[0] ?? 0;
      const thumbstickY = axes[3] ?? axes[1] ?? 0;

      if (Math.abs(thumbstickX) > 0.1 || Math.abs(thumbstickY) > 0.1) {
        this.applyThumbstickMovement(thumbstickX, thumbstickY);
      }

      if (Math.abs(thumbstickX) > 0.8) {
        this.applySnapTurn(Math.sign(thumbstickX), time);
      }

      if (this.isTeleportActive && input.handedness) {
        this.updateTeleportPreview(input.handedness);
      }

      if (!this.isTeleportActive && this.teleportMarker) {
        this.teleportMarker.visible = false;
      }

      this.isTeleportActive = false;
    }
  }

  private updateRigReference() {
    const camObj = (this.cameraRef as any)?._objRef ?? (this.cameraRef as any)?.object3d ?? (this.cameraRef as any)?.threeObject;
    if (camObj?.parent) {
      this.rigGroup = camObj.parent;
    }
  }

  private applyThumbstickMovement(x: number, y: number) {
    if (!this.rigGroup || !this.cameraRef) return;

    const camObj = (this.cameraRef as any)?._objRef ?? (this.cameraRef as any)?.object3d ?? (this.cameraRef as any)?.threeObject;
    if (!camObj) return;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camObj.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(camObj.quaternion);
    right.y = 0;
    right.normalize();

    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -y);
    moveDir.addScaledVector(right, x);
    moveDir.normalize();

    const delta = moveDir.multiplyScalar(this.MOVE_SPEED * 0.016);
    this.rigGroup.position.add(delta);
  }

  private applySnapTurn(direction: number, time: number) {
    if (!this.cameraRef || time - this.lastSnapTurnTime < this.SNAP_TURN_COOLDOWN) return;

    const camObj = (this.cameraRef as any)?._objRef ?? (this.cameraRef as any)?.object3d ?? (this.cameraRef as any)?.threeObject;
    if (!camObj) return;

    camObj.rotateY(direction * this.SNAP_TURN_ANGLE);
    this.lastSnapTurnTime = time;
  }

  private updateTeleportPreview(handedness: string) {
    if (!this.xrRenderer?.xr || !this.teleportMarker) return;

    const controllers = this.xrRenderer.xr.getControllerGrips();
    const inputSources = this.xrRenderer.xr.getInputSources();
    let controller: THREE.Object3D | null = null;

    for (let i = 0; i < controllers.length; i++) {
      if (inputSources?.[i]?.handedness === handedness) {
        controller = controllers[i];
        break;
      }
    }

    if (!controller) return;

    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, -1, 0);
    controller.getWorldPosition(origin);
    controller.getWorldDirection(direction);

    const raycaster = new THREE.Raycaster(origin, direction);
    raycaster.far = this.TELEPORT_RANGE;

    const sceneObj = this.sceneRef?.object3d ?? this.sceneRef?._objRef ?? this.sceneRef?.threeObject;
    if (!sceneObj) return;

    const ground = sceneObj.getObjectByName('ground');
    const intersects = ground
      ? raycaster.intersectObject(ground, true)
      : raycaster.intersectObject(sceneObj, true);

    const validHit = intersects.find(hit => {
      const obj = hit.object;
      return obj.name === 'ground' || (obj.parent?.name === 'ground');
    });

    if (validHit) {
      this.teleportMarker.position.copy(validHit.point);
      this.teleportMarker.visible = true;
    } else {
      this.teleportMarker.visible = false;
    }
  }

  private cleanupLocomotion() {
    if (this.teleportMarker) {
      this.teleportMarker.visible = false;
      const sceneObj = this.sceneRef?.object3d ?? this.sceneRef?._objRef ?? this.sceneRef?.threeObject;
      if (sceneObj && this.teleportMarker.parent === sceneObj) {
        sceneObj.remove(this.teleportMarker);
      }
      this.teleportMarker.geometry?.dispose();
      (this.teleportMarker.material as THREE.Material)?.dispose();
      this.teleportMarker = null;
    }
    this.rigGroup = null;
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
      this.xrActive.set(false);
      if (endSession) this.detachVrSelectHandler(endSession);
      this.xrRenderer = null;
      this.processState.statusMessage.set('Exited VR session.');
      this.cdrRef?.markForCheck();
    }
  }

  resetView() {
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

    this.prevCameraPos = null;
    this.prevControlsTarget = null;
  }

  private computeSceneOffset(): [number, number, number] {
    const nodes = this.processState.allNodes();
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
  }

  private applyVrSceneOffset() {
    const nodes = this.processState.allNodes();
    if (!nodes.length) return;

    const offset = this.computeSceneOffset();
    this.prevNodePositions = new Map();

    nodes.forEach(node => {
      this.prevNodePositions?.set(node.id, node.position.clone());
      const next = node.position.clone().add(new THREE.Vector3(offset[0], offset[1], offset[2]));
      this.processState.moveNode(node.id, next);
    });
  }

  private restoreVrSceneOffset() {
    if (!this.prevNodePositions) return;
    this.prevNodePositions.forEach((pos, id) => {
      this.processState.moveNode(id, pos);
    });
    this.prevNodePositions = null;
  }

  private getRenderer(): any {
    return (
      (this.cameraRef as any)?._renderer ??
      (this.cameraRef as any)?.renderer ??
      (this.engineRef as any)?.wegblRenderer ??
      (this.engineRef as any)?.webglRenderer ??
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

  private attachVrSelectHandler(session: any) {
    if (this.xrSelectHandler) return;

    const raycaster = new THREE.Raycaster();

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
      raycaster.set(origin, direction);

      const objects = Array.from(this.nodeObjectMap.values());
      const hits = raycaster.intersectObjects(objects, true);

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
      this.processState.selectNode(nodeId);
      this.processState.statusMessage.set(`Selected Node ${nodeId}`);
      this.onNodeSelected?.(nodeId);
    };

    session.addEventListener('select', this.xrSelectHandler);
  }

  private detachVrSelectHandler(session: any) {
    if (!this.xrSelectHandler) return;
    session.removeEventListener('select', this.xrSelectHandler);
    this.xrSelectHandler = undefined;
  }
}
