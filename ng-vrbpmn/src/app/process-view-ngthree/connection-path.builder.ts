import * as THREE from 'three';
import { Connection, Node } from './process-state.service';
import { CONNECTION_CONFIG, NODE_CONFIG } from './process-view.constants';

export class ConnectionPathBuilder {
  private nodeOffset: number;
  private connTouchesSubprocess: boolean;
  private sourceNode: Node;
  private targetNode: Node;

  constructor(source: Node, target: Node) {
    this.sourceNode = source;
    this.targetNode = target;
    this.nodeOffset = source.type === 'subprocess' ? 0 : CONNECTION_CONFIG.NODE_OFFSET;
    this.connTouchesSubprocess = source.type === 'subprocess' || target.type === 'subprocess';
  }

  computeConnPath(conn: Connection, nodes: Node[]): THREE.CurvePath<THREE.Vector3> {
    if (conn.waypoints && conn.waypoints.length >= 2) {
      const points = conn.waypoints.map(point => new THREE.Vector3(point.x, CONNECTION_CONFIG.Y_POSITION, point.z));
      if (points.length >= 2) {
        const eps = 1e-4;
        let startIdx = 1;
        while (startIdx < points.length && points[startIdx].distanceTo(points[0]) < eps) {
          startIdx += 1;
        }
        let endIdx = points.length - 2;
        while (endIdx >= 0 && points[endIdx].distanceTo(points[points.length - 1]) < eps) {
          endIdx -= 1;
        }
        const startRef = points[startIdx] ?? points[points.length - 1];
        const endRef = points[endIdx] ?? points[0];
        const startAnchor = this.getWaypointAnchor(this.sourceNode, startRef);
        const endAnchor = this.getWaypointAnchor(this.targetNode, endRef);
        points[0] = new THREE.Vector3(startAnchor.x, CONNECTION_CONFIG.Y_POSITION, startAnchor.z);
        points[points.length - 1] = new THREE.Vector3(endAnchor.x, CONNECTION_CONFIG.Y_POSITION, endAnchor.z);
      }
      const orthoPoints = this.orthogonalizePath(points);
      return this.buildRoundedPath(orthoPoints, CONNECTION_CONFIG.CORNER_RADIUS);
    }

    const a = this.getNodeAnchor(this.sourceNode, this.targetNode.position);
    const b = this.getNodeAnchor(this.targetNode, this.sourceNode.position);
    a.y = CONNECTION_CONFIG.Y_POSITION;
    b.y = CONNECTION_CONFIG.Y_POSITION;

    const path = new THREE.CurvePath<THREE.Vector3>();
    const offsetA = this.getNodeOffset(this.sourceNode);
    const offsetB = this.getNodeOffset(this.targetNode);

    const { startAnchor, startOutDir } = this.getSideAnchorAndDir(this.sourceNode, this.targetNode.position, offsetA);
    const { startAnchor: endAnchor, startOutDir: endDir } = this.getSideAnchorAndDir(this.targetNode, this.sourceNode.position, offsetB);

    const startOut = this.getFootprintHit(this.sourceNode, startAnchor.clone().add(startOutDir.clone().setLength(offsetA))) ?? startAnchor.clone().add(startOutDir.clone().setLength(offsetA));
    const endIn = this.getFootprintHit(this.targetNode, startOut) ?? endAnchor.clone().add(endDir.clone().setLength(-offsetB));
    startOut.y = CONNECTION_CONFIG.Y_POSITION;
    endIn.y = CONNECTION_CONFIG.Y_POSITION;

    const midPoints: THREE.Vector3[] = [];
    if (Math.abs(startOutDir.x) > 0) {
      midPoints.push(new THREE.Vector3(endIn.x, CONNECTION_CONFIG.Y_POSITION, startOut.z));
    } else {
      midPoints.push(new THREE.Vector3(startOut.x, CONNECTION_CONFIG.Y_POSITION, endIn.z));
    }
    if (Math.abs(startOutDir.x) > 0 && Math.abs(endDir.x) > 0 && Math.abs(midPoints[0].z - endIn.z) > 1e-4) {
      midPoints.push(new THREE.Vector3(endIn.x, CONNECTION_CONFIG.Y_POSITION, endIn.z));
    } else if (Math.abs(startOutDir.z) > 0 && Math.abs(endDir.z) > 0 && Math.abs(midPoints[0].x - endIn.x) > 1e-4) {
      midPoints.push(new THREE.Vector3(endIn.x, CONNECTION_CONFIG.Y_POSITION, endIn.z));
    }

    const pts = [startOut, ...midPoints, endIn];
    const elbowPath = this.buildRoundedPath(pts, CONNECTION_CONFIG.CORNER_RADIUS);
    elbowPath.curves.forEach(curve => path.add(curve));

    return path;
  }

  buildRoundedPath(points: THREE.Vector3[], radius: number): THREE.CurvePath<THREE.Vector3> {
    const path = new THREE.CurvePath<THREE.Vector3>();
    if (points.length < 2) return path;
    points = points.map(p => new THREE.Vector3(p.x, CONNECTION_CONFIG.Y_POSITION, p.z));
    if (points.length === 2 || radius <= 0) {
      path.add(new THREE.LineCurve3(points[0], points[points.length - 1]));
      return path;
    }

    let current = points[0].clone();
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = points[i - 1];
      const point = points[i];
      const next = points[i + 1];

      const dirIn = point.clone().sub(prev);
      const dirOut = next.clone().sub(point);
      const lenIn = dirIn.length();
      const lenOut = dirOut.length();
      if (lenIn < 1e-6 || lenOut < 1e-6) {
        continue;
      }

      dirIn.divideScalar(lenIn);
      dirOut.divideScalar(lenOut);
      const dot = dirIn.dot(dirOut);
      if (Math.abs(dot) > 0.999) {
        path.add(new THREE.LineCurve3(current, point));
        current = point.clone();
        continue;
      }

      const r = Math.min(radius, lenIn * 0.5, lenOut * 0.5);
      const entry = point.clone().sub(dirIn.clone().multiplyScalar(r));
      const exit = point.clone().add(dirOut.clone().multiplyScalar(r));
      path.add(new THREE.LineCurve3(current, entry));
      path.add(new THREE.QuadraticBezierCurve3(entry, point, exit));
      current = exit.clone();
    }
    path.add(new THREE.LineCurve3(current, points[points.length - 1]));
    return path;
  }

  orthogonalizePath(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length <= 2) return points;
    const result: THREE.Vector3[] = [points[0].clone()];
    for (let i = 1; i < points.length; i += 1) {
      const next = points[i];
      const prev = result[result.length - 1];
      if (Math.abs(next.x - prev.x) < 1e-4 || Math.abs(next.z - prev.z) < 1e-4) {
        result.push(next.clone());
        continue;
      }
      const prevPrev = result.length >= 2 ? result[result.length - 2] : null;
      let elbow: THREE.Vector3;
      if (prevPrev) {
        const dxPrev = prev.x - prevPrev.x;
        const dzPrev = prev.z - prevPrev.z;
        if (Math.abs(dxPrev) >= Math.abs(dzPrev)) {
          elbow = new THREE.Vector3(next.x, prev.y, prev.z);
        } else {
          elbow = new THREE.Vector3(prev.x, prev.y, next.z);
        }
      } else {
        if (Math.abs(next.x - prev.x) >= Math.abs(next.z - prev.z)) {
          elbow = new THREE.Vector3(next.x, prev.y, prev.z);
        } else {
          elbow = new THREE.Vector3(prev.x, prev.y, next.z);
        }
      }
      if (elbow.distanceTo(prev) > 1e-4) {
        result.push(elbow);
      }
      result.push(next.clone());
    }

    const simplified: THREE.Vector3[] = [];
    for (let i = 0; i < result.length; i += 1) {
      const p = result[i];
      const prev = simplified[simplified.length - 1];
      if (!prev || p.distanceTo(prev) > 1e-4) {
        simplified.push(p);
      }
    }

    const cleaned: THREE.Vector3[] = [];
    for (let i = 0; i < simplified.length; i += 1) {
      const p = simplified[i];
      const prev = cleaned[simplified.length - 1];
      const next = simplified[i + 1];
      if (!prev || !next) {
        cleaned.push(p);
        continue;
      }
      const collinearX = Math.abs(prev.x - p.x) < 1e-4 && Math.abs(p.x - next.x) < 1e-4;
      const collinearZ = Math.abs(prev.z - p.z) < 1e-4 && Math.abs(p.z - next.z) < 1e-4;
      if (collinearX || collinearZ) {
        continue;
      }
      cleaned.push(p);
    }
    return cleaned;
  }

  getConnPath(nodes: Node[]): THREE.CurvePath<THREE.Vector3> {
    return this.computeConnPath({ id: '', sourceId: this.sourceNode.id, targetId: this.targetNode.id } as Connection, nodes);
  }

  getTubeArgs(nodes: Node[]): [THREE.CurvePath<THREE.Vector3>, number, number, number, boolean] {
    const radius = this.connTouchesSubprocess ? 0.45 : CONNECTION_CONFIG.TUBE_RADIUS;
    return [this.getConnPath(nodes), 20, radius, 8, false];
  }

  getArrowPos(nodes: Node[]): THREE.Vector3 {
    const path = this.getConnPath(nodes);
    const pts = path.getPoints(20);
    return pts[pts.length - 1];
  }

  getArrowQuat(nodes: Node[]): THREE.Quaternion {
    const path = this.getConnPath(nodes);
    const pts = path.getPoints(20);
    if (pts.length < 2) return new THREE.Quaternion();
    const dir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return quat;
  }

  getFootprintPos(nodes: Node[], type: 'source' | 'target'): THREE.Vector3 {
    const node = nodes.find(n => n.id === (type === 'source' ? this.sourceNode.id : this.targetNode.id));
    if (!node) return new THREE.Vector3();
    const p = node.position.clone();
    p.y = CONNECTION_CONFIG.Y_POSITION;
    return p;
  }

  private getNodeOffset(node: Node): number {
    if (node.type === 'subprocess') return 0;
    return CONNECTION_CONFIG.NODE_OFFSET;
  }

  private getNodeAnchor(node: Node, toward: THREE.Vector3): THREE.Vector3 {
    const { halfW, halfD, radius } = this.getNodeHalfExtents(node);
    const to = new THREE.Vector3(toward.x - node.position.x, 0, toward.z - node.position.z);
    const absDx = Math.abs(to.x);
    const absDz = Math.abs(to.z);
    let normal: THREE.Vector3;
    if (absDx >= absDz) {
      normal = to.x >= 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
    } else {
      normal = to.z >= 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
    }
    const anchor = node.position.clone().add(new THREE.Vector3(normal.x * halfW, 0, normal.z * halfD));
    if (node.type === 'subprocess') return anchor;
    return anchor.add(normal.clone().setLength(radius * 0.15));
  }

  private getWaypointAnchor(node: Node, toward: THREE.Vector3): THREE.Vector3 {
    if (node.type === 'subprocess') {
      return this.getNodeAnchor(node, toward);
    }
    const dir = toward.clone().sub(node.position);
    const len = dir.length();
    if (len < 0.0001) return node.position.clone();
    dir.divideScalar(len);
    const anchor = node.position.clone().add(dir.multiplyScalar(this.getNodeOffset(node)));
    anchor.y = CONNECTION_CONFIG.Y_POSITION;
    return anchor;
  }

  private getSideAnchorAndDir(node: Node, toward: THREE.Vector3, offset: number): { startAnchor: THREE.Vector3; startOutDir: THREE.Vector3 } {
    const { halfW, halfD } = this.getNodeHalfExtents(node);
    const to = new THREE.Vector3(toward.x - node.position.x, 0, toward.z - node.position.z);
    const absDx = Math.abs(to.x);
    const absDz = Math.abs(to.z);
    let normal: THREE.Vector3;
    if (absDx >= absDz) {
      normal = to.x >= 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
    } else {
      normal = to.z >= 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
    }
    const anchor = node.position.clone().add(new THREE.Vector3(normal.x * halfW, 0, normal.z * halfD));
    anchor.y = CONNECTION_CONFIG.Y_POSITION;
    return { startAnchor: anchor, startOutDir: normal };
  }

  private getFootprintHit(node: Node, from: THREE.Vector3): THREE.Vector3 | null {
    if (node.type === 'subprocess') {
      const shell = this.getSubprocessShellDims(node, 'outer');
      return this.rayRectIntersect(from, node.position, shell.width / 2, shell.depth / 2);
    }
    const radius = 0.75;
    return this.rayCircleIntersect(from, node.position, radius);
  }

  private rayCircleIntersect(from: THREE.Vector3, center: THREE.Vector3, radius: number): THREE.Vector3 | null {
    const dir = center.clone().sub(from);
    dir.y = 0;
    const len = dir.length();
    if (len < 1e-4) return null;
    dir.normalize();
    const hit = from.clone().add(dir.multiplyScalar(Math.max(0, len - radius)));
    hit.y = CONNECTION_CONFIG.Y_POSITION;
    return hit;
  }

  private rayRectIntersect(from: THREE.Vector3, center: THREE.Vector3, halfW: number, halfD: number): THREE.Vector3 | null {
    const dir = center.clone().sub(from);
    dir.y = 0;
    const len = dir.length();
    if (len < 1e-4) return null;
    dir.normalize();
    const tx = dir.x !== 0 ? (dir.x > 0 ? (center.x - halfW - from.x) / dir.x : (center.x + halfW - from.x) / dir.x) : Infinity;
    const tz = dir.z !== 0 ? (dir.z > 0 ? (center.z - halfD - from.z) / dir.z : (center.z + halfD - from.z) / dir.z) : Infinity;
    const t = Math.min(tx, tz);
    if (!Number.isFinite(t) || t < 0) return null;
    const hit = from.clone().add(dir.multiplyScalar(Math.max(0, Math.min(t, len))));
    hit.y = CONNECTION_CONFIG.Y_POSITION;
    return hit;
  }

  private getNodeHalfExtents(node: Node): { halfW: number; halfD: number; radius: number } {
    if (node.type === 'subprocess') {
      const shell = this.getSubprocessShellDims(node, 'outer');
      return { halfW: shell.width / 2, halfD: shell.depth / 2, radius: Math.min(shell.width, shell.depth) * 0.5 };
    }
    const square = 1.2;
    const round = 0.75 * 2;
    const useRound = this.isRound(node.type);
    const size = useRound ? round : square;
    const half = size / 2;
    return { halfW: half, halfD: half, radius: size * 0.5 };
  }

  private isRound(type: string): boolean {
    return type === 'start' || type === 'terminal' || type.endsWith('gateway') || type === 'messageStart' || type === 'messageCatch' || type === 'boundary';
  }

  private getSubprocessShellDims(node: Node, layer: 'outer' | 'inner'): { width: number; height: number; depth: number } {
    const baseW = node.bounds?.width ?? 4;
    const baseD = node.bounds?.height ?? 3;
    const scale = layer === 'outer' ? 1.05 : 0.95;
    return {
      width: baseW * scale,
      height: 1.6,
      depth: baseD * scale
    };
  }
}

export function getConnPath(conn: Connection, nodes: Node[]): THREE.CurvePath<THREE.Vector3> {
  const source = nodes.find(n => n.id === conn.sourceId);
  const target = nodes.find(n => n.id === conn.targetId);
  if (!source || !target) return new THREE.CurvePath<THREE.Vector3>();
  const builder = new ConnectionPathBuilder(source, target);
  return builder.computeConnPath(conn, nodes);
}

export function getConnGeometry(conn: Connection, nodes: Node[]): THREE.BufferGeometry {
  const path = getConnPath(conn, nodes);
  return new THREE.BufferGeometry().setFromPoints(path.getSpacedPoints(CONNECTION_CONFIG.PATH_SEGMENTS));
}

export function getTubeArgs(conn: Connection, nodes: Node[]): [THREE.CurvePath<THREE.Vector3>, number, number, number, boolean] {
  const source = nodes.find(n => n.id === conn.sourceId);
  const target = nodes.find(n => n.id === conn.targetId);
  if (!source || !target) {
    const emptyPath = new THREE.CurvePath<THREE.Vector3>();
    return [emptyPath, 20, CONNECTION_CONFIG.TUBE_RADIUS, 8, false];
  }
  const builder = new ConnectionPathBuilder(source, target);
  return builder.getTubeArgs(nodes);
}

export function getArrowPos(conn: Connection, nodes: Node[]): THREE.Vector3 {
  const path = getConnPath(conn, nodes);
  const pts = path.getPoints(20);
  return pts[pts.length - 1];
}

export function getArrowQuat(conn: Connection, nodes: Node[]): THREE.Quaternion {
  const path = getConnPath(conn, nodes);
  const pts = path.getPoints(20);
  if (pts.length < 2) return new THREE.Quaternion();
  const dir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return quat;
}

export function getFootprintPos(conn: Connection, nodes: Node[], type: 'source' | 'target'): THREE.Vector3 {
  const node = nodes.find(n => n.id === (type === 'source' ? conn.sourceId : conn.targetId));
  if (!node) return new THREE.Vector3();
  const p = node.position.clone();
  p.y = CONNECTION_CONFIG.Y_POSITION;
  return p;
}

export function isSubprocessNode(nodeId: string, nodes: Node[]): boolean {
  return nodes.some(node => node.id === nodeId && node.type === 'subprocess');
}
