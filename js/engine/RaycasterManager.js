// ============================================================
// RaycasterManager — Raycasting y detección de intersección
// ============================================================

import * as THREE from 'three';
import { renderer } from './SceneManager.js';
import { cam3D, camOrthoMain, camTop, camLeft, camRight, camFront, camIso, splitViews } from './CameraManager.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.05; // 5 cm threshold to click exactly on lines
const mouse = new THREE.Vector2();

/**
 * Set raycaster from a pointer event
 * @param {PointerEvent|MouseEvent} e
 */
export function setRaycasterFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1.0 - ((e.clientY - rect.top) / rect.height);
    
    let x, y;
    let cam;
    
    if (State.get('is3DMode')) {
        // 3D mode: full canvas, perspective camera
        x = nx * 2 - 1;
        y = ny * 2 - 1;
        cam = cam3D;
    } else if (!State.get('isSplit')) {
        // 2D single view: full canvas, ortho main camera
        x = nx * 2 - 1;
        y = ny * 2 - 1;
        cam = camOrthoMain;
    } else {
        // 2D split view: find which quadrant the click is in
        // Use the actual splitViews layout from CameraManager
        cam = camOrthoMain; // fallback
        x = nx * 2 - 1;
        y = ny * 2 - 1;
        
        for (const v of splitViews) {
            if (nx >= v.left && nx < v.left + v.width &&
                ny >= v.bottom && ny < v.bottom + v.height) {
                // Remap coordinates to this quadrant's local space
                x = ((nx - v.left) / v.width) * 2 - 1;
                y = ((ny - v.bottom) / v.height) * 2 - 1;
                cam = v.cam;
                break;
            }
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
    const intersects = raycaster.intersectObjects(testObjects, true);
    return mapIntersectsToStructures(intersects, testObjects);
}

/**
 * Maps intersected objects back to the top-level structures array
 * @param {THREE.Intersection[]} intersects
 * @param {THREE.Object3D[]} structures
 * @returns {THREE.Intersection[]}
 */
export function mapIntersectsToStructures(intersects, structures) {
    const mapped = intersects.map(hit => {
        let obj = hit.object;
        while (obj && !structures.includes(obj)) {
            obj = obj.parent;
        }
        if (obj) {
            return { ...hit, object: obj };
        }
        return hit;
    });
    return mapped.filter(hit => structures.includes(hit.object));
}

/**
 * Get the raycaster instance for plane intersection (drag)
 */
export function getRaycaster() {
    return raycaster;
}
