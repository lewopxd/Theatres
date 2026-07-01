// ============================================================
// main.js — Entry point: orquesta loader → boot → animate loop
// ============================================================

import { delay, createIcons, $ } from './utils/dom.js';
import { State } from './core/State.js';
import { Settings } from './core/Settings.js';
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

// Theatre
import { buildTheatre } from './theatre/TheatreFactory.js';

// Tools
import { setActiveTool, initToolShortcuts, initPlaneButtons, initToolButtons } from './tools/ToolManager.js';
import { handleSelectClick } from './tools/SelectTool.js';
import { initDrag, performDrag, endDrag } from './tools/MoveTool.js';
import { MoveHandle } from './engine/MoveHandle.js';

// UI
import { initLoader, loaderActivate, loaderComplete, loaderDismiss } from './ui/LoaderUI.js';
import { initPropertiesPanel, deselectAll } from './ui/PropertiesPanel.js';
import { initSidebar } from './ui/SidebarController.js';
import { initTopBar } from './ui/TopBarController.js';
import { initTreeBuilder } from './ui/TreeBuilder.js';
import { initStatusBar } from './ui/StatusBar.js';
import { isOverUI } from './utils/dom.js';
import { DRAG_THRESHOLD } from './utils/constants.js';

// ============================================================
// BOOT SEQUENCE
// ============================================================
async function boot() {
    Settings.init();

    // STEP 1: DOM
    initLoader();
    loaderActivate('dom', 'Construyendo interfaz…');
    await delay(60);
    loaderComplete('dom');

    // STEP 2: Icons
    loaderActivate('icons', 'Cargando íconos…');
    await new Promise(resolve => {
        if (window.lucide) {
            window.lucide.createIcons();
            resolve();
        } else {
            window.addEventListener('load', () => {
                if (window.lucide) window.lucide.createIcons();
                resolve();
            }, { once: true });
            setTimeout(resolve, 2000);
        }
    });
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

    buildTheatre();
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
    initStatusBar();
    initToolShortcuts();
    initPlaneButtons();
    initToolButtons();

    // Setup pointer events for canvas
    initCanvasPointerEvents(container);

    // Restore from localStorage
    History.restoreFromStorage();

    loaderComplete('state');

    // Final setup
    setActiveTool('orbit');
    deselectAll();
    createIcons();

    await loaderDismiss();
    startAnimationLoop();
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
                
                if (intersects.length > 0 || hitHandle) {
                    e.stopPropagation(); // Stop OrbitControls from panning
                    // Auto-activate move tool and start drag immediately
                    if (tool !== 'move') {
                        State.set('preDragTool', tool);
                        setActiveTool('move');
                    }
                    initDrag(e);
                    return;
                }
            }

            if (tool === 'move' && selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked) {
                initDrag(e);
            }
        }
    });
    const canvasWrapper = $('canvas-wrapper');

    const checkHoverVisibility = (e) => {
        const selectedMesh = State.get('selectedMesh');
        const isDragging = State.get('isDragging');

        // Handle visibility of the center point (MoveHandle)
        if (selectedMesh && selectedMesh.userData.editable && !selectedMesh.userData.locked) {
            setRaycasterFromEvent(e);
            const raycaster = getRaycaster();
            
            const handleHovered = MoveHandle.isVisible && MoveHandle.hitTest(raycaster);
            
            if (!MoveHandle.isVisible) MoveHandle.show(selectedMesh);
            MoveHandle.setHover(handleHovered);
        } else {
            if (MoveHandle.isVisible) {
                MoveHandle.hide();
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
        checkHoverVisibility(e);

        if (!isPointerDown) return;
        if (isOverUI(e)) return;
        if (State.get('isDragging')) performDrag(e);
    });

    renderer.domElement.addEventListener('pointerup', e => {
        if (!isPointerDown) return;
        isPointerDown = false;

        // Note: we don't force hide the handle here, pointermove will hide it 
        // if the mouse is no longer over the object.

        if (State.get('isDragging')) {
            endDrag();
            const preDragTool = State.get('preDragTool');
            if (preDragTool) {
                setActiveTool(preDragTool);
                State.set('preDragTool', null);
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
