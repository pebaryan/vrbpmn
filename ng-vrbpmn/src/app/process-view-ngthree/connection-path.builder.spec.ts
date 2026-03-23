import * as THREE from 'three';
import {
  ConnectionPathBuilder,
  getConnPath,
  getConnGeometry,
  getTubeArgs,
  getArrowPos,
  getArrowQuat,
  getFootprintPos,
  isSubprocessNode
} from './connection-path.builder';
import { Node, Connection } from './process-state.service';
import { CONNECTION_CONFIG } from './process-view.constants';

function makeNode(id: string, type: string, x: number, z: number, opts: Partial<Node> = {}): Node {
  return {
    id,
    type: type as any,
    position: new THREE.Vector3(x, 0, z),
    name: `Node ${id}`,
    description: '',
    multiInstance: null,
    parentId: null,
    bounds: null,
    ...opts
  };
}

function makeConn(sourceId: string, targetId: string, waypoints?: Array<{ x: number; z: number }>): Connection {
  return { id: `${sourceId}_${targetId}`, sourceId, targetId, waypoints };
}

describe('ConnectionPathBuilder', () => {

  // ── Basic Path Computation ──

  describe('computeConnPath', () => {
    it('should produce a non-empty path between two nodes', () => {
      const source = makeNode('A', 'start', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should produce a path from start to end position area', () => {
      const source = makeNode('A', 'start', 0, 0);
      const target = makeNode('B', 'terminal', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      const pts = path.getPoints(20);
      // Start point should be near source position
      expect(pts[0].distanceTo(source.position) < 5).toBeTrue();
      // End point should be near target position
      expect(pts[pts.length - 1].distanceTo(target.position) < 5).toBeTrue();
    });

    it('should handle nodes at the same x position', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 0, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle nodes at the same z position', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle diagonal node positions', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should use waypoints when provided', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const waypoints = [
        { x: 0, z: 0 },
        { x: 5, z: 0 },
        { x: 5, z: 3 },
        { x: 10, z: 3 },
        { x: 10, z: 0 }
      ];
      const conn = makeConn('A', 'B', waypoints);
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle minimum 2-point waypoints', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B', [{ x: 0, z: 0 }, { x: 5, z: 0 }]);
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });
  });

  // ── Subprocess Connections ──

  describe('subprocess connections', () => {
    it('should handle connection from subprocess', () => {
      const source = makeNode('S', 'subprocess', 0, 0, { bounds: { width: 4, height: 3 } });
      const target = makeNode('T', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('S', 'T');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle connection to subprocess', () => {
      const source = makeNode('S', 'usertask', 0, 0);
      const target = makeNode('T', 'subprocess', 10, 0, { bounds: { width: 4, height: 3 } });
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('S', 'T');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle connection between two subprocesses', () => {
      const source = makeNode('S', 'subprocess', 0, 0, { bounds: { width: 4, height: 3 } });
      const target = makeNode('T', 'subprocess', 10, 0, { bounds: { width: 4, height: 3 } });
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('S', 'T');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should use wider tube radius for subprocess connections', () => {
      const source = makeNode('S', 'subprocess', 0, 0, { bounds: { width: 4, height: 3 } });
      const target = makeNode('T', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const [, , radius] = builder.getTubeArgs([source, target]);
      expect(radius).toBe(0.45);
    });

    it('should use default tube radius for non-subprocess connections', () => {
      const source = makeNode('S', 'usertask', 0, 0);
      const target = makeNode('T', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const [, , radius] = builder.getTubeArgs([source, target]);
      expect(radius).toBe(CONNECTION_CONFIG.TUBE_RADIUS);
    });
  });

  // ── Node Type Shapes ──

  describe('node type extents', () => {
    const roundTypes = ['start', 'terminal', 'xgateway', 'pgateway', 'eventgateway', 'messageStart', 'messageCatch', 'boundary'];
    const rectTypes = ['usertask', 'servicetask', 'subprocess'];

    roundTypes.forEach(type => {
      it(`should handle round node type '${type}'`, () => {
        const source = makeNode('A', type, 0, 0);
        const target = makeNode('B', 'usertask', 10, 0);
        const builder = new ConnectionPathBuilder(source, target);
        const conn = makeConn('A', 'B');
        const path = builder.computeConnPath(conn, [source, target]);
        expect(path.curves.length).toBeGreaterThan(0);
      });
    });

    rectTypes.forEach(type => {
      it(`should handle rect node type '${type}'`, () => {
        const opts = type === 'subprocess' ? { bounds: { width: 4, height: 3 } } : {};
        const source = makeNode('A', type, 0, 0, opts as any);
        const target = makeNode('B', 'usertask', 10, 0);
        const builder = new ConnectionPathBuilder(source, target);
        const conn = makeConn('A', 'B');
        const path = builder.computeConnPath(conn, [source, target]);
        expect(path.curves.length).toBeGreaterThan(0);
      });
    });
  });

  // ── buildRoundedPath ──

  describe('buildRoundedPath', () => {
    it('should return empty path for fewer than 2 points', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const path = builder.buildRoundedPath([new THREE.Vector3(0, 0, 0)], 0.5);
      expect(path.curves.length).toBe(0);
    });

    it('should return straight line for 2 points', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const a = new THREE.Vector3(0, 0, 0);
      const b = new THREE.Vector3(5, 0, 0);
      const path = builder.buildRoundedPath([a, b], 0.5);
      expect(path.curves.length).toBe(1);
    });

    it('should create rounded corners for L-shaped path', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const a = new THREE.Vector3(0, 0, 0);
      const corner = new THREE.Vector3(5, 0, 0);
      const b = new THREE.Vector3(5, 0, 5);
      const path = builder.buildRoundedPath([a, corner, b], 0.5);
      // Should have: line + curve + line = 3 curves
      expect(path.curves.length).toBe(3);
    });

    it('should handle zero radius (no rounding)', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 0, 0),
        new THREE.Vector3(5, 0, 5)
      ];
      const path = builder.buildRoundedPath(points, 0);
      // With radius 0, should just be a straight line from first to last
      expect(path.curves.length).toBe(1);
    });

    it('should handle collinear points (no corner needed)', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 0, 0),
        new THREE.Vector3(10, 0, 0)
      ];
      const path = builder.buildRoundedPath(points, 0.5);
      // Collinear points should produce straight segments
      expect(path.curves.length).toBeGreaterThanOrEqual(1);
    });

    it('should clamp radius to half segment length', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 2, 2);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0), // short segment
        new THREE.Vector3(1, 0, 2)
      ];
      const path = builder.buildRoundedPath(points, 10); // large radius gets clamped
      expect(path.curves.length).toBe(3); // line + curve + line
    });
  });

  // ── orthogonalizePath ──

  describe('orthogonalizePath', () => {
    it('should return same points if already orthogonal', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 0, 0),
        new THREE.Vector3(5, 0, 5)
      ];
      const result = builder.orthogonalizePath(points);
      expect(result.length).toBe(3);
      expect(result[0].x).toBeCloseTo(0);
      expect(result[1].x).toBeCloseTo(5);
      expect(result[1].z).toBeCloseTo(0);
      expect(result[2].x).toBeCloseTo(5);
      expect(result[2].z).toBeCloseTo(5);
    });

    it('should insert elbow for diagonal segment', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 5);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 0, 5) // diagonal
      ];
      const result = builder.orthogonalizePath(points);
      // Should have added an elbow point
      expect(result.length).toBe(3);
    });

    it('should return 2 points or fewer unchanged', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const result1 = builder.orthogonalizePath([new THREE.Vector3(0, 0, 0)]);
      expect(result1.length).toBe(1);
      const result2 = builder.orthogonalizePath([new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0)]);
      expect(result2.length).toBe(2);
    });

    it('should remove collinear intermediate points', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(3, 0, 0),
        new THREE.Vector3(7, 0, 0),
        new THREE.Vector3(10, 0, 0)
      ];
      const result = builder.orthogonalizePath(points);
      // All collinear on x-axis, should simplify to just start and end
      expect(result.length).toBe(2);
    });

    it('should remove near-duplicate points', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 5, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.00001, 0, 0.00001), // near duplicate
        new THREE.Vector3(5, 0, 0)
      ];
      const result = builder.orthogonalizePath(points);
      expect(result.length).toBe(2); // duplicate removed + collinear cleanup
    });
  });

  // ── Helper Functions ──

  describe('getArrowPos', () => {
    it('should return position at end of path', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const nodes = [source, target];
      const builder = new ConnectionPathBuilder(source, target);
      const pos = builder.getArrowPos(nodes);
      // Arrow should be near the target
      expect(pos.distanceTo(target.position) < 5).toBeTrue();
    });
  });

  describe('getArrowQuat', () => {
    it('should return a quaternion', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const nodes = [source, target];
      const builder = new ConnectionPathBuilder(source, target);
      const quat = builder.getArrowQuat(nodes);
      expect(quat).toBeInstanceOf(THREE.Quaternion);
      // Should be a valid rotation (unit quaternion)
      expect(quat.length()).toBeCloseTo(1, 3);
    });
  });

  describe('getFootprintPos', () => {
    it('should return source node position at connection y', () => {
      const source = makeNode('A', 'usertask', 3, 7);
      const target = makeNode('B', 'usertask', 10, 0);
      const nodes = [source, target];
      const builder = new ConnectionPathBuilder(source, target);
      const pos = builder.getFootprintPos(nodes, 'source');
      expect(pos.x).toBe(3);
      expect(pos.z).toBe(7);
      expect(pos.y).toBe(CONNECTION_CONFIG.Y_POSITION);
    });

    it('should return target node position at connection y', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 5);
      const nodes = [source, target];
      const builder = new ConnectionPathBuilder(source, target);
      const pos = builder.getFootprintPos(nodes, 'target');
      expect(pos.x).toBe(10);
      expect(pos.z).toBe(5);
    });

    it('should return zero vector for missing node', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const pos = builder.getFootprintPos([], 'source'); // empty nodes list
      expect(pos.x).toBe(0);
      expect(pos.z).toBe(0);
    });
  });

  // ── Exported Free Functions ──

  describe('getConnPath (free function)', () => {
    it('should compute path for valid connection', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const path = getConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should return empty path for missing source', () => {
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('missing', 'B');
      const path = getConnPath(conn, [target]);
      expect(path.curves.length).toBe(0);
    });

    it('should return empty path for missing target', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const conn = makeConn('A', 'missing');
      const path = getConnPath(conn, [source]);
      expect(path.curves.length).toBe(0);
    });
  });

  describe('getConnGeometry', () => {
    it('should return BufferGeometry', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const geom = getConnGeometry(conn, [source, target]);
      expect(geom).toBeInstanceOf(THREE.BufferGeometry);
      geom.dispose();
    });
  });

  describe('getTubeArgs', () => {
    it('should return tuple with path, segments, radius, radialSegments, closed', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const [path, segments, radius, radialSegments, closed] = getTubeArgs(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
      expect(segments).toBe(20);
      expect(radius).toBe(CONNECTION_CONFIG.TUBE_RADIUS);
      expect(radialSegments).toBe(8);
      expect(closed).toBeFalse();
    });

    it('should return empty path for missing nodes', () => {
      const conn = makeConn('missing', 'also_missing');
      const [path] = getTubeArgs(conn, []);
      expect(path.curves.length).toBe(0);
    });
  });

  describe('getArrowPos (free function)', () => {
    it('should return last point of path', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const pos = getArrowPos(conn, [source, target]);
      expect(pos).toBeInstanceOf(THREE.Vector3);
      expect(pos.distanceTo(target.position) < 5).toBeTrue();
    });
  });

  describe('getArrowQuat (free function)', () => {
    it('should return a unit quaternion', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const quat = getArrowQuat(conn, [source, target]);
      expect(quat).toBeInstanceOf(THREE.Quaternion);
      expect(quat.length()).toBeCloseTo(1, 3);
    });

    it('should return identity quaternion for empty path', () => {
      const conn = makeConn('missing', 'also_missing');
      const quat = getArrowQuat(conn, []);
      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });
  });

  describe('getFootprintPos (free function)', () => {
    it('should return source position at connection height', () => {
      const source = makeNode('A', 'usertask', 3, 7);
      const target = makeNode('B', 'usertask', 10, 0);
      const conn = makeConn('A', 'B');
      const pos = getFootprintPos(conn, [source, target], 'source');
      expect(pos.x).toBe(3);
      expect(pos.z).toBe(7);
      expect(pos.y).toBe(CONNECTION_CONFIG.Y_POSITION);
    });

    it('should return zero vector for missing node', () => {
      const conn = makeConn('A', 'B');
      const pos = getFootprintPos(conn, [], 'source');
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(pos.z).toBe(0);
    });
  });

  describe('isSubprocessNode', () => {
    it('should return true for subprocess node', () => {
      const sub = makeNode('S', 'subprocess', 0, 0, { bounds: { width: 4, height: 3 } });
      expect(isSubprocessNode('S', [sub])).toBeTrue();
    });

    it('should return false for non-subprocess node', () => {
      const task = makeNode('T', 'usertask', 0, 0);
      expect(isSubprocessNode('T', [task])).toBeFalse();
    });

    it('should return false for non-existent node', () => {
      expect(isSubprocessNode('missing', [])).toBeFalse();
    });
  });

  // ── Edge Cases ──

  describe('edge cases', () => {
    it('should handle very close nodes', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 0.01, 0.01);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      // Should not throw
      expect(() => builder.computeConnPath(conn, [source, target])).not.toThrow();
    });

    it('should handle overlapping nodes', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 0, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      expect(() => builder.computeConnPath(conn, [source, target])).not.toThrow();
    });

    it('should handle very far apart nodes', () => {
      const source = makeNode('A', 'usertask', -1000, -1000);
      const target = makeNode('B', 'usertask', 1000, 1000);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should handle subprocess with no bounds (uses defaults)', () => {
      const source = makeNode('A', 'subprocess', 0, 0); // no bounds
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      expect(() => builder.computeConnPath(conn, [source, target])).not.toThrow();
    });

    it('should handle negative positions', () => {
      const source = makeNode('A', 'usertask', -5, -3);
      const target = makeNode('B', 'usertask', -10, -8);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      expect(path.curves.length).toBeGreaterThan(0);
    });

    it('should set all path points to connection Y position', () => {
      const source = makeNode('A', 'usertask', 0, 0);
      const target = makeNode('B', 'usertask', 10, 0);
      const builder = new ConnectionPathBuilder(source, target);
      const conn = makeConn('A', 'B');
      const path = builder.computeConnPath(conn, [source, target]);
      const pts = path.getPoints(20);
      pts.forEach(p => {
        expect(p.y).toBeCloseTo(CONNECTION_CONFIG.Y_POSITION, 1);
      });
    });
  });
});
