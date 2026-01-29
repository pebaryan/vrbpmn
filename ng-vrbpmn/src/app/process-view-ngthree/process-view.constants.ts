import * as THREE from 'three';

// Scene Configuration
export const SCENE_CONFIG = {
    GROUND_Y: -1.5,
    GROUND_OFFSET: 0.01,
    GRID_OPACITY: 0.5,
    FOG_NEAR: 5,
    FOG_FAR: 25,
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
    TUBE_RADIUS: 0.3,
    TUBE_SEGMENTS: 8,
} as const;

// Node Configuration
export const NODE_CONFIG = {
    SPACING: 5.0,
    LABEL_Y_OFFSET: 1.5,
    HOVER_BOUNCE_SPEED: 5,
    HOVER_BOUNCE_AMPLITUDE: 0.15,
    BASE_ROTATION_SPEED: 0.0025,
    HOVER_ROTATION_SPEED: 0.05,
} as const;

// Arrow Configuration
export const ARROW_CONFIG = {
    RADIUS: 0.15,
    HEIGHT: 0.4,
    SEGMENTS: 8,
    EMISSIVE_INTENSITY: 2,
} as const;

// Footprint Configuration
export const FOOTPRINT_CONFIG = {
    INNER_RADIUS: 0.7,
    OUTER_RADIUS: 0.75,
    SEGMENTS: 32,
    OPACITY: 0.2,
} as const;

// Camera Configuration
export const CAMERA_CONFIG = {
    FOV: 50,
    ASPECT: 1.5,
    NEAR: 0.1,
    FAR: 1000,
    POSITION: new THREE.Vector3(0, 10, -20),
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
} as const;

// Light Configuration
export const LIGHT_CONFIG = {
    AMBIENT_INTENSITY: 0.5,
    POINT_LIGHT_INTENSITY: 1000,
    POINT_LIGHT_DISTANCE: 100,
    POINT_LIGHT_POSITION: new THREE.Vector3(0, 10, 5),
} as const;

// Grid Configuration
export const GRID_CONFIG = {
    SIZE: 60,
    DIVISIONS: 60,
    COLOR_1: 0x444444,
    COLOR_2: 0x222222,
} as const;
