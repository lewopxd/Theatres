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

// === DEBUG: acumuladores del render loop ===
let __debugFrameCount = 0;
let __debugLastRafTime = 0;
let __debugRafGapTotal = 0;
let __debugRafGapMax = 0;
let __debugPersonasTotal = 0;
let __debugPersonasMax = 0;
let __debugSelectionLoopTotal = 0;
let __debugSelectionLoopMax = 0;
let __debugRenderFrameTotal = 0;
let __debugRenderFrameMax = 0;
let __debugReportIntervalMs = 2000; // imprime un resumen cada 2 segundos
let __debugLastReportTime = 0;
let __debugDrawCallsSample = null;

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

    // === DEBUG: muestreo de draw calls / triángulos cada cierto tiempo ===
    if (renderer.info) {
        __debugDrawCallsSample = {
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures
        };
    }
}

/**
 * Start the animation loop
 */
export function startAnimationLoop() {
    function animate() {
        requestAnimationFrame(animate);

        // === DEBUG: medir el gap real entre llamadas de rAF (el "pulso" del navegador) ===
        const __rafNow = performance.now();
        if (__debugLastRafTime) {
            const __rafGap = __rafNow - __debugLastRafTime;
            __debugRafGapTotal += __rafGap;
            if (__rafGap > __debugRafGapMax) __debugRafGapMax = __rafGap;
        }
        __debugLastRafTime = __rafNow;

        const delta = clock.getDelta();

        // === DEBUG: medir PersonasEngine.update ===
        const __t1 = performance.now();
        PersonasEngine.update(delta);
        const __personasTime = performance.now() - __t1;
        __debugPersonasTotal += __personasTime;
        if (__personasTime > __debugPersonasMax) __debugPersonasMax = __personasTime;

        // === DEBUG: medir updateSelectionLoop ===
        const __t2 = performance.now();
        updateSelectionLoop();
        
        // Sync gizmo size to camera distance continuously
        if (State.get('is3DMode')) {
            RotationGizmo.syncCamera(cam3D, window.innerHeight);
        }

        const __selectionLoopTime = performance.now() - __t2;
        __debugSelectionLoopTotal += __selectionLoopTime;
        if (__selectionLoopTime > __debugSelectionLoopMax) __debugSelectionLoopMax = __selectionLoopTime;

        // === DEBUG: medir renderFrame (render real de Three.js) ===
        const __t3 = performance.now();
        renderFrame();
        const __renderFrameTime = performance.now() - __t3;
        __debugRenderFrameTotal += __renderFrameTime;
        if (__renderFrameTime > __debugRenderFrameMax) __debugRenderFrameMax = __renderFrameTime;

        __debugFrameCount++;

        // === DEBUG: warning inmediato si UN frame individual es muy pesado ===
        const __totalFrame = __personasTime + __selectionLoopTime + __renderFrameTime;
        if (__totalFrame > 20 && typeof window !== 'undefined' && window.__TECAL_DEBUG_LOOP === true) {
            console.warn(
                `[LOOP DEBUG] Frame pesado — TOTAL: ${__totalFrame.toFixed(2)}ms | ` +
                `PersonasEngine.update: ${__personasTime.toFixed(2)}ms | ` +
                `updateSelectionLoop: ${__selectionLoopTime.toFixed(2)}ms | ` +
                `renderFrame: ${__renderFrameTime.toFixed(2)}ms`
            );
        }

        // === DEBUG: resumen periódico (cada __debugReportIntervalMs) para ver el promedio real de FPS ===
        if (typeof window !== 'undefined' && window.__TECAL_DEBUG_LOOP === true && __rafNow - __debugLastReportTime > __debugReportIntervalMs) {
            const __avgRafGap = __debugRafGapTotal / __debugFrameCount;
            const __fps = 1000 / __avgRafGap;
            console.log(
                `%c[LOOP DEBUG] ===== RESUMEN RENDER LOOP (últimos ${(__debugReportIntervalMs / 1000).toFixed(0)}s) =====`,
                'color:#ffaa33;font-weight:bold;font-size:12px'
            );
            console.table({
                'Frames en el período': __debugFrameCount,
                'FPS promedio estimado': __fps.toFixed(1),
                'Gap promedio entre rAF (ms)': __avgRafGap.toFixed(2),
                'Gap máximo entre rAF (ms)': __debugRafGapMax.toFixed(2),
                'PersonasEngine.update — promedio (ms)': (__debugPersonasTotal / __debugFrameCount).toFixed(3),
                'PersonasEngine.update — máximo (ms)': __debugPersonasMax.toFixed(2),
                'updateSelectionLoop — promedio (ms)': (__debugSelectionLoopTotal / __debugFrameCount).toFixed(3),
                'updateSelectionLoop — máximo (ms)': __debugSelectionLoopMax.toFixed(2),
                'renderFrame — promedio (ms)': (__debugRenderFrameTotal / __debugFrameCount).toFixed(3),
                'renderFrame — máximo (ms)': __debugRenderFrameMax.toFixed(2)
            });
            if (__debugDrawCallsSample) {
                console.log(
                    `[LOOP DEBUG] Draw calls: ${__debugDrawCallsSample.calls} | Triángulos: ${__debugDrawCallsSample.triangles} | Geometrías en memoria: ${__debugDrawCallsSample.geometries} | Texturas en memoria: ${__debugDrawCallsSample.textures}`
                );
            }
            if (performance.memory) {
                const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                const totalMB = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
                const limitMB = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(1);
                console.log(`[LOOP DEBUG] Heap JS: ${usedMB}MB usados / ${totalMB}MB reservados / ${limitMB}MB límite`);
            }

            // Diagnóstico automático
            if (__avgRafGap > 20) {
                console.warn('%c[LOOP DEBUG] DIAGNÓSTICO: el render loop corre por debajo de 50fps de forma sostenida — el cuello de botella está en el render, no en el drag de rotación.', 'color:#ff6666;font-weight:bold');
            }
            if (__debugRenderFrameMax > 15 && (__debugRenderFrameTotal / __debugFrameCount) > 8) {
                console.warn('%c[LOOP DEBUG] DIAGNÓSTICO: renderFrame (el render.render real de Three.js) es el consumidor principal — revisar shaders, cantidad de draw calls o resolución/pixelRatio.', 'color:#ff6666;font-weight:bold');
            }
            if ((__debugPersonasTotal / __debugFrameCount) > 3) {
                console.warn('%c[LOOP DEBUG] DIAGNÓSTICO: PersonasEngine.update tiene un costo significativo por frame, incluso sin interactuar con Personas.', 'color:#ff6666;font-weight:bold');
            }

            // Reset del período
            __debugFrameCount = 0;
            __debugRafGapTotal = 0;
            __debugRafGapMax = 0;
            __debugPersonasTotal = 0;
            __debugPersonasMax = 0;
            __debugSelectionLoopTotal = 0;
            __debugSelectionLoopMax = 0;
            __debugRenderFrameTotal = 0;
            __debugRenderFrameMax = 0;
            __debugLastReportTime = __rafNow;
        }
    }
    animate();
}