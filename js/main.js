// ============================================================
// main.js — Entry point: orquesta loader → boot → animate loop
// ============================================================

import { delay, createIcons, $ } from './utils/dom.js';
import { State } from './core/State.js';
import { Settings } from './core/Settings.js';
import { Storage } from './core/Storage.js';
import { EventBus } from './core/EventBus.js';
import { History } from './core/History.js';
import { Registry } from './core/Registry.js';

// Engine
import { renderer, scene, applyLayerVisibility, updateBrightness } from './engine/SceneManager.js';
import {
    cam3D, ctrl3D, resizeCameras, initOrthoSync, updateActiveOrthoControl
} from './engine/CameraManager.js';
import { initViewport, waitForViewport, startAnimationLoop, renderFrame } from './engine/ViewportManager.js';
import { setRaycasterFromEvent, getRaycaster, mapIntersectsToStructures } from './engine/RaycasterManager.js';
import { MinimalGizmo } from './engine/GizmoController.js';
import { generateGrid } from './engine/GridGenerator.js';
import { syncSelectionEdges } from './engine/SelectionRenderer.js';
import { RulerOverlay } from './engine/RulerOverlay.js';

// Theatre
import { buildTheatre } from './theatre/TheatreFactory.js';

// Tools
import { setActiveTool, initToolShortcuts, initPlaneButtons, initToolButtons } from './tools/ToolManager.js';
import { handleSelectClick } from './tools/SelectTool.js';
import { initDrag, performDrag, endDrag } from './tools/MoveTool.js';
import { MoveHandle } from './engine/MoveHandle.js';
import { RotationGizmo } from './engine/RotationGizmo.js';
import { initRotateDrag, performRotateDrag, endRotateDrag } from './tools/RotateTool.js';

// UI
import { initLoader, loaderActivate, loaderComplete, loaderDismiss } from './ui/LoaderUI.js';
import { initPropertiesPanel, deselectAll } from './ui/PropertiesPanel.js';
import { initSidebar } from './ui/SidebarController.js';
import { initTopBar } from './ui/TopBarController.js';
import { initTreeBuilder } from './ui/TreeBuilder.js';
import { initStatusBar } from './ui/StatusBar.js';
import { populateTeatroSelect } from './ui/CatalogController.js';
import { isOverUI } from './utils/dom.js';
import { DRAG_THRESHOLD } from './utils/constants.js';
import { GizmoDebugWindow } from './ui/GizmoDebugWindow.js';

// ============================================================
// BOOT SEQUENCE
// ============================================================
async function boot() {
    await Settings.init();

    // STEP 1: DOM
    initLoader();
    loaderActivate('dom', 'Construyendo interfaz…');
    await delay(60);
    loaderComplete('dom');

    // STEP 2: Icons (Phosphor Icons are CSS-based, no JS init needed)
    loaderActivate('icons', 'Cargando íconos…');
    await delay(100); // Small delay so Phosphor web font can start loading
    loaderComplete('icons');

    // STEP 3: Three.js (already imported)
    loaderActivate('three', 'Inicializando motor 3D…');
    await delay(40);

    const container = $('canvas-wrapper');
    container.appendChild(renderer.domElement);

    loaderComplete('three');

    // STEP 4: Build scene
    loaderActivate('scene', 'Construyendo escena…');
    await delay(30);

    buildTheatre({ isEmpty: true });
    const dimsVisible = State.get('dimsVisible');
    Registry.getDimensions().forEach(d => d.setVisibility(dimsVisible, State.get('is3DMode')));

    loaderComplete('scene');

    // STEP 5: Viewport
    loaderActivate('viewport', 'Calculando viewport…');
    await waitForViewport(container);

    // Create gizmo
    const gizmoEl = $('gizmo-container');
    const gizmo = new MinimalGizmo(cam3D, renderer, gizmoEl);

    // Init camera sync
    initOrthoSync(() => State.get('is3DMode'));

    // Init viewport (resize observer + render loop setup)
    initViewport(container, gizmo);
    resizeCameras(container, State.get('is3DMode'), State.get('isSplit'));

    // Init ruler overlay (autonomous engine)
    RulerOverlay.init(container);
    // Start hidden — will be shown when switching to 2D mode
    RulerOverlay.setVisible(false);

    loaderComplete('viewport');

    // STEP 6: First frame
    loaderActivate('render', 'Renderizando primer frame…');

    applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));
    generateGrid(State.getGridConfig());

    renderer.clear();
    ctrl3D.update();
    renderer.setViewport(0, 0, container.clientWidth, container.clientHeight);
    renderer.setScissorTest(false);
    renderer.render(scene, cam3D);
    gizmo.render();

    loaderComplete('render');

    // STEP 7: Restore state + init UI
    loaderActivate('state', 'Restaurando estado…');

    // Initialize all UI controllers
    initPropertiesPanel();
    initSidebar();
    initTopBar(gizmo);
    initTreeBuilder();
    populateTeatroSelect();
    initStatusBar();
    initToolShortcuts();
    initPlaneButtons();
    initToolButtons();
    GizmoDebugWindow.init();

    // Setup pointer events for canvas
    initCanvasPointerEvents(container);

    // Restore from localStorage (await ensures all 3D GLTFs finish loading)
    await History.restoreFromStorage();

    // Remove the 3D loading overlay and unlock the UI
    const appShell = $('app-shell');
    if (appShell) {
        appShell.classList.remove('app-loading');
    }

    loaderComplete('state');

    // Final setup
    setActiveTool('orbit');
    deselectAll();
    createIcons();

    await loaderDismiss();
    startAnimationLoop();

    // ── DEV: Clear button handler ──
    const btnClear = $('btn-clear-all');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (confirm('¿Limpiar TODO? (localStorage + caches + reload)')) {
                Storage.clear().then(() => {
                    localStorage.clear();
                    if ('caches' in window) {
                        caches.keys().then(names => names.forEach(n => caches.delete(n)));
                    }
                    location.reload(true);
                });
            }
        });
    }

    // ── Ruler visibility logic (reacts to mode changes) ──
    const updateRulerVisibility = () => {
        const is3D = State.get('is3DMode');
        const mode = State.get('active2DMode');
        const isSplit = State.get('isSplit');
        // Show rulers in 2D mode (not ortho), including split
        RulerOverlay.setVisible(!is3D && (isSplit || mode !== 'ortho'));
    };
    EventBus.on('state:is3DMode', updateRulerVisibility);
    EventBus.on('state:active2DMode', updateRulerVisibility);
    EventBus.on('state:isSplit', updateRulerVisibility);
}

// ============================================================
// CANVAS POINTER EVENTS — bridge between tools and canvas
// ============================================================
function initCanvasPointerEvents(container) {
    let isPointerDown = false;
    let pointerDownPos = { x: 0, y: 0 };

    renderer.domElement.addEventListener('pointerdown', e => {
        if (isOverUI(e)) return;
        isPointerDown = true;
        pointerDownPos = { x: e.clientX, y: e.clientY };

        // Clear hover effect on pointer down so original object doesn't stay white during drag
        const prevHover = State.get('hoverMesh');
        if (prevHover) {
            prevHover.traverse(child => {
                if (child.isMesh && child.material && child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                }
            });
            const prevWire = Registry.findWireById(prevHover.userData.id);
            if (prevWire && prevWire.material) {
                prevWire.material.color.copy(prevWire.userData.baseColor);
            }
            State.set('hoverMesh', null);
        }

        setRaycasterFromEvent(e);

        // Update active controls for 2D mode so they don't all process the pan simultaneously
        if (!State.get('is3DMode')) {
            updateActiveOrthoControl(e, container, State.get('isSplit'));
        }

        if (e.button === 0) {
            const tool = State.get('activeTool');
            const selectedMesh = State.get('selectedMesh');

            // Check if clicking directly on the selected object OR the move handle
            if (selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked) {
                const raycaster = getRaycaster();

                // Temporarily make the mesh visible for raycasting (useful in 2D mode where it might be a wireframe)
                const wasVisible = selectedMesh.visible;
                selectedMesh.visible = true;
                const intersects = raycaster.intersectObject(selectedMesh, true);
                selectedMesh.visible = wasVisible;

                const hitHandle = MoveHandle.hitTest(raycaster);
                const hitRotationObj = RotationGizmo.hitTest(raycaster);
                const hitRotation = hitRotationObj ? hitRotationObj.axis : null;

                if (intersects.length > 0 || hitHandle || hitRotation) {
                    e.stopPropagation(); // Stop OrbitControls from panning
                    // Auto-activate move or rotate tool and start drag immediately
                    if (hitRotation || tool === 'rotate') {
                        if (tool !== 'rotate') {
                            State.set('preDragTool', tool);
                            setActiveTool('rotate');
                        }
                        initRotateDrag(e);
                    } else {
                        if (tool !== 'move') {
                            State.set('preDragTool', tool);
                            setActiveTool('move');
                        }
                        initDrag(e);
                    }
                    // Capturamos el puntero en el canvas: garantiza que pointermove/pointerup
                    // sigan llegando aquí aunque el cursor salga del rect del canvas o pase
                    // sobre otro elemento del DOM (paneles, gizmo de navegación, topbar) durante
                    // un drag rápido. Sin esto, el navegador puede dejar de entregar eventos al
                    // salir del elemento, lo que se sentía como rotación errática/mínima.
                    renderer.domElement.setPointerCapture(e.pointerId);
                    State.set('hasDragged', false);
                    return;
                }
            }

            if (tool === 'move' && selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked) {
                initDrag(e);
                renderer.domElement.setPointerCapture(e.pointerId);
                State.set('hasDragged', false);
            }
        }
    });
    const canvasWrapper = $('canvas-wrapper');

    const updateGizmoVisibility = () => {
        const selectedMesh = State.get('selectedMesh');
        const activeTool = State.get('activeTool');
        const isEditable = selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked;

        if (isEditable && activeTool === 'rotate' && State.get('is3DMode')) {
            MoveHandle.hide();
            RotationGizmo.show(selectedMesh);
        } else if (isEditable) {
            RotationGizmo.hide();
            MoveHandle.show(selectedMesh);
        } else {
            MoveHandle.hide();
            RotationGizmo.hide();
        }
    };
    EventBus.on('state:selectedMesh', updateGizmoVisibility);
    EventBus.on('tool:changed', updateGizmoVisibility);

    const checkHoverVisibility = (e) => {
        const selectedMesh = State.get('selectedMesh');
        const isDragging = State.get('isDragging');

        const activeTool = State.get('activeTool');

        // Handle visibility of the center point (MoveHandle) and RotationGizmo
        if (selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked) {
            setRaycasterFromEvent(e);
            const raycaster = getRaycaster();

            if (activeTool === 'rotate' && State.get('is3DMode')) {
                const hitAxisObj = RotationGizmo.hitTest(raycaster);
                RotationGizmo.setHover(hitAxisObj ? hitAxisObj.halfId : null);
            } else {
                const handleHovered = MoveHandle.isVisible && MoveHandle.hitTest(raycaster);
                MoveHandle.setHover(handleHovered);
            }
        }

        // Handle global hover effect — ONLY in 3D mode (no hover in 2D per user request)
        if (!isPointerDown && State.get('is3DMode')) {
            setRaycasterFromEvent(e);
            const raycaster = getRaycaster();
            const visibleStructures = Registry.getStructures().filter(
                m => m.userData.layerVisible && !m.userData.locked
            );
            let intersects = raycaster.intersectObjects(visibleStructures, true);
            intersects = mapIntersectsToStructures(intersects, visibleStructures);

            let hoverMesh = null;
            if (intersects.length > 0) {
                hoverMesh = intersects[0].object;
            }

            const prevHover = State.get('hoverMesh');
            if (prevHover !== hoverMesh) {
                // Restore previous hover state
                if (prevHover) {
                    prevHover.traverse(child => {
                        if (child.isMesh && child.material && child.material.emissive) {
                            child.material.emissive.setHex(0x000000);
                        }
                    });
                }

                // Apply new hover state (3D only)
                if (hoverMesh) {
                    hoverMesh.traverse(child => {
                        if (child.isMesh && child.material && child.material.emissive) {
                            child.material.emissive.setHex(0x333333);
                        }
                    });
                }

                State.set('hoverMesh', hoverMesh);
            }
        } else if (!State.get('is3DMode')) {
            // Clear any leftover hover when in 2D
            const prevHover = State.get('hoverMesh');
            if (prevHover) {
                prevHover.traverse(child => {
                    if (child.isMesh && child.material && child.material.emissive) {
                        child.material.emissive.setHex(0x000000);
                    }
                });
                const prevWire = Registry.findWireById(prevHover.userData.id);
                if (prevWire && prevWire.material) {
                    prevWire.material.color.copy(prevWire.userData.baseColor);
                }
                State.set('hoverMesh', null);
            }
        }
    };

    renderer.domElement.addEventListener('pointermove', e => {
        // Si NO estamos con el botón presionado, es simple hover: chequeo normal,
        // incluyendo el bloqueo por UI (no queremos hover "fantasma" bajo un panel).
        if (!isPointerDown) {
            checkHoverVisibility(e);
            return;
        }

        // Con el botón presionado y en medio de un drag activo, el evento se procesa
        // SIEMPRE — sin cortar por isOverUI y sin gastar en el raycast de hover.
        // Antes, isOverUI(e) devolvía early cada vez que el cursor pasaba por encima
        // de un panel/gizmo/topbar superpuesto al canvas durante el arrastre, y
        // checkHoverVisibility hacía un RotationGizmo.hitTest de más en cada frame:
        // ambos perdían/retrasaban eventos de pointermove y se sentían como una
        // rotación errática que apenas avanzaba unos milímetros.
        if (State.get('isDragging')) {
            const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
            if (dist >= DRAG_THRESHOLD) {
                State.set('hasDragged', true);
                if (State.get('activeTool') === 'rotate') performRotateDrag(e);
                else performDrag(e);
            }
            return;
        }

        if (isOverUI(e)) return;
        checkHoverVisibility(e);
    });

    renderer.domElement.addEventListener('pointerup', e => {
        if (renderer.domElement.hasPointerCapture?.(e.pointerId)) {
            renderer.domElement.releasePointerCapture(e.pointerId);
        }

        if (!isPointerDown) return;
        isPointerDown = false;

        // Note: we don't force hide the handle here, pointermove will hide it 
        // if the mouse is no longer over the object.

        if (State.get('isDragging')) {
            const hasDragged = State.get('hasDragged');
            if (State.get('activeTool') === 'rotate') endRotateDrag(hasDragged);
            else endDrag(hasDragged);

            const preDragTool = State.get('preDragTool');
            if (preDragTool) {
                setActiveTool(preDragTool);
                State.set('preDragTool', null);
            }

            if (!hasDragged) {
                handleSelectClick(e, pointerDownPos);
                checkHoverVisibility(e);
            }
            return;
        }

        handleSelectClick(e, pointerDownPos);

        // Check hover immediately after selection so the handle shows up without needing to move the mouse
        checkHoverVisibility(e);
    });
}

// ============================================================
// LAUNCH
// ============================================================
boot().catch(err => {
    console.error('[Tecal] Boot failed:', err);
});