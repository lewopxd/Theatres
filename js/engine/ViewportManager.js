// ============================================================
// ViewportManager — Render loop, viewport, resize observer
// ============================================================

import * as THREE from 'three';
import { renderer, scene } from './SceneManager.js';
import {
    cam3D, camOrthoMain,
    ctrl3D, ctrlOrthoMain, ctrlTop, ctrlIso, ctrlLeft, ctrlRight,
    splitViews, resizeCameras
} from './CameraManager.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { PersonasEngine } from './PersonasEngine.js';
import { updateLoop as updateSelectionLoop } from './SelectionRenderer.js';

let gizmoRef = null;
let containerRef = null;
const clock = new THREE.Clock();

/**
 * Initialize viewport manager
 * @param {HTMLElement} container — the canvas wrapper
 * @param {Object} gizmo — the MinimalGizmo instance
 */
export function initViewport(container, gizmo) {
    containerRef = container;
    gizmoRef = gizmo;

    // Resize observer
    const resizeObs = new ResizeObserver(() => {
        resizeCameras(container, State.get('is3DMode'), State.get('isSplit'));
    });
    resizeObs.observe(container);
    window.addEventListener('resize', () => {
        resizeCameras(container, State.get('is3DMode'), State.get('isSplit'));
    });
}

/**
 * Wait for the container to have real dimensions
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
export function waitForViewport(container) {
    return new Promise(resolve => {
        function check() {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                resolve();
            } else {
                requestAnimationFrame(check);
            }
        }
        requestAnimationFrame(check);
    });
}

function updateDimsVisibility(mode) {
    const dimsVisible = State.get('dimsVisible');
    const dims = Registry.getDimensions();
    dims.forEach(d => {
        if (!d.group || !d.group.userData.views) return;
        if (!dimsVisible) {
            d.group.visible = false;
        } else {
            d.group.visible = d.group.userData.views.includes(mode);
        }
    });
}

/**
 * One animation frame — called by requestAnimationFrame
 */
export function renderFrame() {
    renderer.clear();
    const is3DMode = State.get('is3DMode');
    const isSplit = State.get('isSplit');

    const grid = scene.getObjectByName('__grid__');

    if (is3DMode) {
        if (grid) grid.visible = true;
        updateDimsVisibility('3d');
        ctrl3D.update();
        renderer.setViewport(0, 0, containerRef.clientWidth, containerRef.clientHeight);
        renderer.setScissorTest(false);
        renderer.render(scene, cam3D);
        if (gizmoRef) gizmoRef.render();
    } else if (!isSplit) {
        const activeMode = State.get('active2DMode');
        if (grid) grid.visible = (activeMode !== 'left' && activeMode !== 'right' && activeMode !== 'front');
        updateDimsVisibility(activeMode);
        ctrlOrthoMain.update();
        renderer.setViewport(0, 0, containerRef.clientWidth, containerRef.clientHeight);
        renderer.setScissorTest(false);
        renderer.render(scene, camOrthoMain);
    } else {
        splitViews.forEach(v => v.ctrl.update());
        const w = containerRef.clientWidth, h = containerRef.clientHeight;
        renderer.setScissorTest(true);
        splitViews.forEach(v => {
            const vl = Math.floor(w * v.left);
            const vb = Math.floor(h * v.bottom);
            const vw = Math.floor(w * v.width);
            const vh = Math.floor(h * v.height);
            
            if (grid) grid.visible = (v.mode !== 'left' && v.mode !== 'right' && v.mode !== 'front');
            updateDimsVisibility(v.mode);
            renderer.setViewport(vl, vb, vw, vh);
            renderer.setScissor(vl, vb, vw, vh);
            renderer.render(scene, v.cam);
        });
        renderer.setScissorTest(false);
    }
}

/**
 * Start the animation loop
 */
export function startAnimationLoop() {
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        PersonasEngine.update(delta);
        updateSelectionLoop();
        renderFrame();
    }
    animate();
}
