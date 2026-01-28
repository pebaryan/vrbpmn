import { Component, inject, computed, NO_ERRORS_SCHEMA, OnDestroy } from '@angular/core';
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
  ThConeGeometry
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
  schemas: [NO_ERRORS_SCHEMA] // Keep it for extra safety with non-standard attributes
})
export class ProcessViewNgThreeComponent implements OnDestroy {
  // ===== Services =====
  public state = inject(ProcessStateService);

  // ===== Template Helpers =====
  public Math = Math;
  public THREE = THREE;
  public lookAt: [number, number, number] = [0, 0, 0];

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
        geom = new THREE.BufferGeometry().setFromPoints(this.computeConnPath(conn, nodes).getPoints(CONNECTION_CONFIG.PATH_SEGMENTS));
        this.geometryCache.set(conn.id, geom);
      } else {
        // Update existing geometry
        geom.setFromPoints(this.computeConnPath(conn, nodes).getPoints(CONNECTION_CONFIG.PATH_SEGMENTS));
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
    const shiftKey = !!(event?.event?.shiftKey ?? event?.domEvent?.shiftKey ?? event?.shiftKey);
    if (this.state.interactionMode() === 'move') {
      if (shiftKey) {
        this.state.toggleNodeSelection(nodeId);
        return;
      }
      this.state.selectNode(nodeId);
      this.dragStartPoint = this.getDragPoint(event) ?? this.state.allNodes().find(n => n.id === nodeId)?.position.clone() ?? null;
      this.dragStartPositions.clear();
      this.state.selectedNodeIds().forEach(id => {
        const node = this.state.allNodes().find(n => n.id === id);
        if (node) this.dragStartPositions.set(id, node.position.clone());
      });
      return;
    }
    this.state.selectNode(nodeId);
  }

  onNodeRender(event: any, nodeId: string) {
    const group = event.object as THREE.Group;
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

    // Straight line for close nodes
    if (Math.abs(diffX) < CONNECTION_CONFIG.MIN_DISTANCE_FOR_CORNER || Math.abs(diffZ) < CONNECTION_CONFIG.MIN_DISTANCE_FOR_CORNER) {
      const dir = b.clone().sub(a).normalize();
      path.add(new THREE.LineCurve3(
        a.clone().add(dir.clone().multiplyScalar(CONNECTION_CONFIG.NODE_OFFSET)),
        b.clone().sub(dir.clone().multiplyScalar(CONNECTION_CONFIG.NODE_OFFSET))
      ));
      return path;
    }

    // Rounded corner path
    const p1 = new THREE.Vector3(
      a.x + (diffX > 0 ? CONNECTION_CONFIG.NODE_OFFSET : -CONNECTION_CONFIG.NODE_OFFSET),
      CONNECTION_CONFIG.Y_POSITION,
      a.z
    );
    const p2 = new THREE.Vector3(b.x, CONNECTION_CONFIG.Y_POSITION, a.z);
    const p3 = new THREE.Vector3(
      b.x,
      CONNECTION_CONFIG.Y_POSITION,
      b.z + (diffZ > 0 ? -CONNECTION_CONFIG.NODE_OFFSET : CONNECTION_CONFIG.NODE_OFFSET)
    );

    path.add(new THREE.LineCurve3(
      p1,
      p2.clone().add(new THREE.Vector3(diffX > 0 ? -CONNECTION_CONFIG.CORNER_RADIUS : CONNECTION_CONFIG.CORNER_RADIUS, 0, 0))
    ));
    path.add(new THREE.QuadraticBezierCurve3(
      p2.clone().add(new THREE.Vector3(diffX > 0 ? -CONNECTION_CONFIG.CORNER_RADIUS : CONNECTION_CONFIG.CORNER_RADIUS, 0, 0)),
      p2,
      p2.clone().add(new THREE.Vector3(0, 0, diffZ > 0 ? CONNECTION_CONFIG.CORNER_RADIUS : -CONNECTION_CONFIG.CORNER_RADIUS))
    ));
    path.add(new THREE.LineCurve3(
      p2.clone().add(new THREE.Vector3(0, 0, diffZ > 0 ? CONNECTION_CONFIG.CORNER_RADIUS : -CONNECTION_CONFIG.CORNER_RADIUS)),
      p3
    ));
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
    if (this.state.interactionMode() === 'delete') {
      this.state.deleteConnection(connId);
      return;
    }
    this.state.selectConnection(connId);
  }

  // General Interactions
  onCanvasClick(event: any) {
    if (this.state.interactionMode() === 'add') {
      const intersect = event.intersects?.[0];
      if (intersect && intersect.object.name === 'ground') {
        const point = intersect.point.clone();
        if (this.state.snapToGrid()) {
          point.x = Math.round(point.x);
          point.z = Math.round(point.z);
          point.y = 0;
        }
        this.state.addNode(point);
      }
      return;
    }
    const intersect = event.intersects?.[0];
    if (intersect && intersect.object.name === 'ground') {
      this.state.clearSelection();
    }
  }

  onMouseMove(event: any) {
    const draggedId = this.state.draggedNodeId();
    if (draggedId && event.intersects) {
      const groundIntersect = event.intersects.find((i: any) => i.object.name === 'ground');
      if (groundIntersect) {
        const pos = groundIntersect.point.clone();
        pos.y = 0;
        if (!this.dragStartPoint) {
          this.dragStartPoint = pos.clone();
          this.dragStartPositions.clear();
          this.state.selectedNodeIds().forEach(id => {
            const node = this.state.allNodes().find(n => n.id === id);
            if (node) this.dragStartPositions.set(id, node.position.clone());
          });
        }
        const delta = pos.clone().sub(this.dragStartPoint);
        const selectedIds = this.state.selectedNodeIds();
        const snap = this.state.snapToGrid();
        selectedIds.forEach(id => {
          const start = this.dragStartPositions.get(id);
          if (!start) return;
          const next = start.clone().add(delta);
          if (snap) {
            next.x = Math.round(next.x);
            next.z = Math.round(next.z);
          }
          this.state.moveNode(id, next);
        });
      }
    }
  }

  onMouseUp(event: MouseEvent) {
    this.state.endDrag();
    this.dragStartPoint = null;
    this.dragStartPositions.clear();
  }

  private getDragPoint(event: any): THREE.Vector3 | null {
    const intersects = event?.intersects;
    if (!intersects?.length) return null;
    const groundHit = intersects.find((i: any) => i.object?.name === 'ground');
    return (groundHit?.point ?? intersects[0]?.point ?? null) ? (groundHit?.point ?? intersects[0].point).clone() : null;
  }
}
