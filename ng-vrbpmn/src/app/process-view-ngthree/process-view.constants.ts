import * as THREE from 'three';
import type { NodeType } from './process-state.service';

// Scene Configuration
export const SCENE_CONFIG = {
    GROUND_Y: -1.5,
    GROUND_OFFSET: 0.01,
    GRID_OPACITY: 0.35,
    FOG_NEAR: 30,
    FOG_FAR: 110,
} as const;

// Connection Configuration
export const CONNECTION_CONFIG = {
    // Lift connections slightly above ground to avoid z-fighting at shallow camera angles
    Y_POSITION: SCENE_CONFIG.GROUND_Y + 0.1,
    CORNER_RADIUS: 0.5,
    NODE_OFFSET: 0.75,
    MIN_DISTANCE_FOR_CORNER: 1.0,
    PATH_SEGMENTS: 32,
    LINE_OPACITY: 0.5,
    HOVER_OPACITY: 1.0,
    TUBE_RADIUS: 0.05,
    HIT_RADIUS: 0.35,
    TUBE_SEGMENTS: 8,
    PULSE_SPEED: 2.2,
} as const;

// Node Configuration
export const NODE_CONFIG = {
    SPACING: 5.0,
    LABEL_GAP: 0.45,
    HOVER_BOUNCE_SPEED: 5,
    HOVER_BOUNCE_AMPLITUDE: 0.12,
    ICON_ROTATION_SPEED: 0.6,
    SNAP_STEP: 0.5,
} as const;

// Node dimensions (world units). Shared by rendering, connection routing and containment checks.
export const NODE_SIZE = {
    EVENT_RADIUS: 0.6,
    BOUNDARY_RADIUS: 0.32,
    GATEWAY_RADIUS: 0.8,
    TASK_WIDTH: 1.6,
    TASK_HEIGHT: 1.0,
    TASK_DEPTH: 1.1,
} as const;

// Subprocess Configuration
export const SUBPROCESS_CONFIG = {
    DEFAULT_WIDTH: 6,
    DEFAULT_DEPTH: 4,
    MIN_SIZE: 2,
    SHELL_SCALE: 1.05,
    WALL_HEIGHT: 1.6,
    PADDING: 0.6,
} as const;

// BPMN DI (2D diagram) mapping. 3D x → DI x, 3D z → DI y.
export const BPMN_DI_CONFIG = {
    SCALE: 40,
    MARGIN: 120,
    EVENT_SIZE: 36,
    GATEWAY_SIZE: 50,
    TASK_WIDTH: 100,
    TASK_HEIGHT: 80,
} as const;

// Arrow Configuration
export const ARROW_CONFIG = {
    RADIUS: 0.15,
    HEIGHT: 0.4,
    SEGMENTS: 12,
} as const;

// Camera Configuration — camera sits on +z looking toward -z so screen-right is +x and
// screen-down is +z, matching BPMN DI orientation and the default WebXR forward direction.
export const CAMERA_CONFIG = {
    FOV: 50,
    ASPECT: 1.5,
    NEAR: 0.1,
    FAR: 1000,
    POSITION: new THREE.Vector3(0, 14, 20),
    LOOK_AT: new THREE.Vector3(0, 0, 0),
} as const;

// Colors
export const COLORS = {
    CYAN: new THREE.Color('#00f2ff'),
    HIGHLIGHT: new THREE.Color('#414e5c'),
    BLACK: new THREE.Color('#000000'),
    DARK_GRAY: new THREE.Color('#101010'),
    GROUND: new THREE.Color('#05070a'),
    FOG: new THREE.Color('#020408'),
    AMBIENT: new THREE.Color('#aaaaaa'),
    SELECTED: new THREE.Color('#ffffff'),
    LINK_SOURCE: new THREE.Color('#ffc857'),
    DANGER: new THREE.Color('#ff4b6e'),
    RESIZE_HANDLE: new THREE.Color('#ff9900'),
    RESIZE_HANDLE_HOVER: new THREE.Color('#ffcc00'),
} as const;

// Light Configuration
export const LIGHT_CONFIG = {
    AMBIENT_INTENSITY: 0.6,
    POINT_LIGHT_INTENSITY: 1000,
    POINT_LIGHT_DISTANCE: 100,
    POINT_LIGHT_POSITION: new THREE.Vector3(0, 10, 5),
} as const;

// Grid Configuration
export const GRID_CONFIG = {
    SIZE: 120,
    DIVISIONS: 120,
    COLOR_1: 0x2a3a44,
    COLOR_2: 0x141c22,
} as const;

export type NodeGroup = 'event' | 'activity' | 'gateway';

export interface NodeTypeMeta {
    label: string;
    group: NodeGroup;
    idPrefix: string;
    shortcut: string;
    accent: string;
    hint: string;
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
    start: { label: 'Start Event', group: 'event', idPrefix: 'StartEvent', shortcut: '1', accent: '#3dffa8', hint: 'Where the process begins' },
    messageStart: { label: 'Message Start', group: 'event', idPrefix: 'StartEvent', shortcut: '2', accent: '#3dffa8', hint: 'Starts when a message arrives' },
    messageCatch: { label: 'Message Catch', group: 'event', idPrefix: 'Event', shortcut: '3', accent: '#ffc857', hint: 'Waits for a message' },
    boundary: { label: 'Boundary Event', group: 'event', idPrefix: 'BoundaryEvent', shortcut: 'B', accent: '#ffc857', hint: 'Click a task or subprocess to attach' },
    terminal: { label: 'End Event', group: 'event', idPrefix: 'EndEvent', shortcut: '0', accent: '#ff5c7a', hint: 'Where a path finishes' },
    usertask: { label: 'User Task', group: 'activity', idPrefix: 'UserTask', shortcut: '4', accent: '#00f2ff', hint: 'Work done by a person' },
    servicetask: { label: 'Service Task', group: 'activity', idPrefix: 'ServiceTask', shortcut: '5', accent: '#00f2ff', hint: 'Work done by a system' },
    subprocess: { label: 'Subprocess', group: 'activity', idPrefix: 'SubProcess', shortcut: '6', accent: '#00f2ff', hint: 'A container for nested steps' },
    xgateway: { label: 'Exclusive Gateway', group: 'gateway', idPrefix: 'Gateway', shortcut: '7', accent: '#b388ff', hint: 'Choose exactly one path' },
    pgateway: { label: 'Parallel Gateway', group: 'gateway', idPrefix: 'Gateway', shortcut: '8', accent: '#b388ff', hint: 'Split into / join all paths' },
    eventgateway: { label: 'Event Gateway', group: 'gateway', idPrefix: 'Gateway', shortcut: '9', accent: '#b388ff', hint: 'Path chosen by the first event' },
};

export const PALETTE_GROUPS: ReadonlyArray<{ label: string; types: NodeType[] }> = [
    { label: 'Events', types: ['start', 'messageStart', 'messageCatch', 'boundary', 'terminal'] },
    { label: 'Activities', types: ['usertask', 'servicetask', 'subprocess'] },
    { label: 'Gateways', types: ['xgateway', 'pgateway', 'eventgateway'] },
];

/** Node types that a boundary event may be attached to. */
export const BOUNDARY_HOST_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['usertask', 'servicetask', 'subprocess']);

export type NodeShape = 'sphere' | 'diamond' | 'box' | 'container';

export function nodeShape(type: NodeType): NodeShape {
    switch (NODE_TYPE_META[type].group) {
        case 'event':
            return 'sphere';
        case 'gateway':
            return 'diamond';
        default:
            return type === 'subprocess' ? 'container' : 'box';
    }
}

/**
 * Half extents of a node's footprint on the ground plane (x = width, z = depth) and its half height.
 * Subprocesses use their editable bounds.
 */
export function nodeHalfExtents(
    type: NodeType,
    bounds?: { width: number; height: number } | null
): { halfW: number; halfD: number; halfH: number } {
    if (type === 'subprocess') {
        const width = (bounds?.width ?? SUBPROCESS_CONFIG.DEFAULT_WIDTH) * SUBPROCESS_CONFIG.SHELL_SCALE;
        const depth = (bounds?.height ?? SUBPROCESS_CONFIG.DEFAULT_DEPTH) * SUBPROCESS_CONFIG.SHELL_SCALE;
        return { halfW: width / 2, halfD: depth / 2, halfH: SUBPROCESS_CONFIG.WALL_HEIGHT / 2 };
    }
    if (type === 'boundary') {
        const r = NODE_SIZE.BOUNDARY_RADIUS;
        return { halfW: r, halfD: r, halfH: r };
    }
    switch (nodeShape(type)) {
        case 'sphere':
            return { halfW: NODE_SIZE.EVENT_RADIUS, halfD: NODE_SIZE.EVENT_RADIUS, halfH: NODE_SIZE.EVENT_RADIUS };
        case 'diamond':
            return { halfW: NODE_SIZE.GATEWAY_RADIUS, halfD: NODE_SIZE.GATEWAY_RADIUS, halfH: NODE_SIZE.GATEWAY_RADIUS };
        default:
            return { halfW: NODE_SIZE.TASK_WIDTH / 2, halfD: NODE_SIZE.TASK_DEPTH / 2, halfH: NODE_SIZE.TASK_HEIGHT / 2 };
    }
}
