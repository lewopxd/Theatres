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
import { RotationGizmo } from './RotationGizmo.js';
import { RulerOverlay } from './RulerOverlay.js';

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
 * Compute exact world bounds visible in an orthographic camera
 * using Three.js unproject. This guarantees pixel-perfect mapping
 * because it accounts for camera position, target, zoom, orientation.
 *
 * @param {THREE.OrthographicCamera} cam
 * @param {string} mode — 'top'|'bottom'|'front'|'left'|'right'
 * @returns {Object|null} { worldMinH, worldMaxH, worldMinV, worldMaxV, hLabel, vLabel }
 */
function getWorldBoundsForRuler(cam, mode) {
    if (mode === 'ortho') return null;

    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    // Unproject NDC edge midpoints to world space
    // NDC (-1, 0, 0) = left edge center
    // NDC (1, 0, 0)  = right edge center
    // NDC (0, 1, 0)  = top edge center
    // NDC (0, -1, 0) = bottom edge center
    const wL = new THREE.Vector3(-1, 0, 0).unproject(cam);
    const wR = new THREE.Vector3(1, 0, 0).unproject(cam);
    const wT = new THREE.Vector3(0, 1, 0).unproject(cam);
    const wB = new THREE.Vector3(0, -1, 0).unproject(cam);

    let worldMinH, worldMaxH, worldMinV, worldMaxV;
    let hLabel, vLabel;

    switch (mode) {
        case 'top':
        case 'bottom':
            worldMinH = wL.x; worldMaxH = wR.x;
            worldMinV = wT.z; worldMaxV = wB.z;
            hLabel = 'X'; vLabel = 'Z';
            break;
        case 'front':
            worldMinH = wL.x; worldMaxH = wR.x;
            worldMinV = wT.y; worldMaxV = wB.y;
            hLabel = 'X'; vLabel = 'Y';
            break;
        case 'left':
        case 'right':
            worldMinH = wL.z; worldMaxH = wR.z;
            worldMinV = wT.y; worldMaxV = wB.y;
            hLabel = 'Z'; vLabel = 'Y';
            break;
        default:
            return null;
    }

    return { worldMinH, worldMaxH, worldMinV, worldMaxV, hLabel, vLabel };
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
        RotationGizmo.updateCamera(cam3D);
        if (gizmoRef) gizmoRef.render();
    } else if (!isSplit) {
        const activeMode = State.get('active2DMode');
        if (grid) grid.visible = (activeMode !== 'left' && activeMode !== 'right' && activeMode !== 'front');
        updateDimsVisibility(activeMode);
        ctrlOrthoMain.update();
        renderer.setViewport(0, 0, containerRef.clientWidth, containerRef.clientHeight);
        renderer.setScissorTest(false);
        renderer.render(scene, camOrthoMain);

        // Feed exact world bounds to ruler overlay (via unproject)
        const bounds = getWorldBoundsForRuler(camOrthoMain, activeMode);
        if (bounds) RulerOverlay.setCameraData(bounds);
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

        // Feed split quadrant data with exact world bounds
        const quadrants = splitViews.map(v => {
            const qw = Math.floor(w * v.width);
            const qh = Math.floor(h * v.height);
            const qLeft = Math.floor(w * v.left);
            const qTop = h - Math.floor(h * v.bottom) - qh;
            const bounds = getWorldBoundsForRuler(v.cam, v.mode);
            return {
                left: qLeft,
                top: qTop,
                width: qw,
                height: qh,
                data: bounds
            };
        });
        RulerOverlay.setSplitData(quadrants);
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
