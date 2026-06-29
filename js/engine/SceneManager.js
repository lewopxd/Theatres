// ============================================================
// SceneManager — Scene, renderer, lights
// ============================================================

import * as THREE from 'three';
import { BASE_BG_COLOR } from '../utils/constants.js';
import { Registry } from '../core/Registry.js';

export const baseBgColor = new THREE.Color(BASE_BG_COLOR);

// Scene
export const scene = new THREE.Scene();
scene.background = baseBgColor.clone();

// Renderer
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.autoClear = false;

// Lights
export const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
export const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(5, 10, 5);
scene.add(ambientLight, dirLight);

/**
 * Update global brightness based on slider value
 * @param {number} v — brightness value (0..1)
 */
export function updateBrightness(v) {
    ambientLight.intensity = v * 0.4;
    dirLight.intensity = v * 0.7;
    scene.background.copy(baseBgColor).multiplyScalar(v);
    Registry.getWires().forEach(w => {
        if (w.material) w.material.color.copy(w.userData.baseColor).multiplyScalar(v);
    });
}

/**
 * Apply layer visibility (solid vs wireframe)
 * @param {boolean} is3DMode
 * @param {boolean} isWireframe
 */
export function applyLayerVisibility(is3DMode, isWireframe) {
    const effectiveWireframe = !is3DMode || isWireframe;
    Registry.getStructures().forEach(m => {
        m.visible = m.userData.layerVisible && !effectiveWireframe;
    });
    Registry.getWires().forEach(w => {
        w.visible = effectiveWireframe ? w.userData.layerVisible : false;
    });
}
