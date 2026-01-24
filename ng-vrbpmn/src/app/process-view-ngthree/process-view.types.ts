import * as THREE from 'three';

/**
 * Event emitted when a pointer interacts with a Three.js object
 */
export interface ThreePointerEvent {
    object: THREE.Object3D;
    intersects?: THREE.Intersection[];
    point?: THREE.Vector3;
}

/**
 * Event emitted before rendering a Three.js object
 */
export interface ThreeRenderEvent {
    object: THREE.Object3D;
    delta: number;
}

/**
 * Event emitted when clicking on the canvas
 */
export interface ThreeCanvasClickEvent {
    intersects?: Array<{
        object: THREE.Object3D;
        point: THREE.Vector3;
    }>;
}

/**
 * Event emitted when moving the mouse over the canvas
 */
export interface ThreeMouseMoveEvent {
    intersects?: Array<{
        object: THREE.Object3D;
        point: THREE.Vector3;
    }>;
}
