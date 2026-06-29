// ============================================================
// RaycasterManager — Raycasting y detección de intersección
// ============================================================

import * as THREE from 'three';
import { renderer } from './SceneManager.js';
import { cam3D, camOrthoMain, camTop, camLeft, camRight } from './CameraManager.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/**
 * Set raycaster from a pointer event
 * @param {PointerEvent|MouseEvent} e
 */
export function setRaycasterFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Normalize coordinates relative to full canvas (0 to 1)
    // Note: ny is typically 1.0 at the top, 0.0 at the bottom for WebGL, 
    // but e.clientY is 0 at top, so ny = 1.0 - (clientY / height)
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1.0 - ((e.clientY - rect.top) / rect.height);
    
    let x = nx * 2 - 1;
    let y = ny * 2 - 1;
    let cam = State.get('is3DMode') ? cam3D : camOrthoMain;
    
    if (!State.get('is3DMode') && State.get('isSplit')) {
        // Split view mode logic
        // Top-Left: Top View (camTop)
        // Top-Right: Isometric (camOrthoMain)
        // Bottom-Left: Left View (camLeft)
        // Bottom-Right: Right View (camRight)
        
        if (nx < 0.5 && ny > 0.5) {
            cam = camTop;
            x = (nx / 0.5) * 2 - 1;
            y = ((ny - 0.5) / 0.5) * 2 - 1;
        } else if (nx >= 0.5 && ny > 0.5) {
            cam = camOrthoMain;
            x = ((nx - 0.5) / 0.5) * 2 - 1;
            y = ((ny - 0.5) / 0.5) * 2 - 1;
        } else if (nx < 0.5 && ny <= 0.5) {
            cam = camLeft;
            x = (nx / 0.5) * 2 - 1;
            y = (ny / 0.5) * 2 - 1;
        } else {
            cam = camRight;
            x = ((nx - 0.5) / 0.5) * 2 - 1;
            y = (ny / 0.5) * 2 - 1;
        }
    }
    
    mouse.set(x, y);
    raycaster.setFromCamera(mouse, cam);
}

/**
 * Get intersected objects from current raycaster state
 * @returns {THREE.Intersection[]}
 */
export function getIntersected() {
    const testObjects = Registry.getStructures().filter(m => m.userData.layerVisible);
    return raycaster.intersectObjects(testObjects, false);
}

/**
 * Get the raycaster instance for plane intersection (drag)
 */
export function getRaycaster() {
    return raycaster;
}
