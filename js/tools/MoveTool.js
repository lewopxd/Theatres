// ============================================================
// MoveTool — Drag en planos XZ/XY/YZ
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { setRaycasterFromEvent, getRaycaster } from '../engine/RaycasterManager.js';
import { Registry } from '../core/Registry.js';
import { syncSelectionEdges, updateSelectionPosition } from '../engine/SelectionRenderer.js';
import { History } from '../core/History.js';
import { AXIS_LABELS } from '../utils/constants.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { THEATRES_CATALOG, DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';
import { $ } from '../utils/dom.js';
import { getPlaneNormal } from '../utils/math.js';
import { DragGhost } from '../engine/DragGhost.js';
import { MoveHandle } from '../engine/MoveHandle.js';

const dragPlaneObj = new THREE.Plane();
const dragOffset = new THREE.Vector3();
const dragIntersect = new THREE.Vector3();
const dragStart = new THREE.Vector3();
let dragObject = null;
let currentEffectivePlane = 'xz';
let currentDragMode = 'top';

function getEffectivePlane(e) {
    if (State.get('is3DMode')) {
        currentDragMode = '3d';
        return State.get('activePlane');
    }
    
    let mode = State.get('active2DMode');
    if (State.get('isSplit')) {
        const container = $('canvas-wrapper');
        const rect = container.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = 1.0 - ((e.clientY - rect.top) / rect.height);
        
        // Must match CameraManager.splitViews layout:
        if (nx < 0.5 && ny > 0.5) mode = 'top';
        else if (nx >= 0.5 && ny > 0.5) mode = 'front';
        else if (nx < 0.5 && ny <= 0.5) mode = 'left';
        else mode = 'ortho';
    }
    
    currentDragMode = mode;
    
    if (mode === 'top' || mode === 'bottom') return 'xz';
    if (mode === 'left' || mode === 'right') return 'yz';
    if (mode === 'front') return 'xy';
    return 'xz';
}

function getActiveBadge() {
    if (!State.get('isSplit')) return document.getElementById('single-badge');
    if (currentDragMode === 'top') return document.querySelector('.split-badge.tl');
    if (currentDragMode === 'front') return document.querySelector('.split-badge.tr');
    if (currentDragMode === 'left') return document.querySelector('.split-badge.bl');
    if (currentDragMode === 'ortho') return document.querySelector('.split-badge.br');
    return null;
}

function getObjectName(mesh) {
    let objName = mesh.userData.shape || 'Objeto';
    const node = document.querySelector(`.tree-node[data-id="${mesh.userData.id}"]`);
    if (node) {
        const nameSpan = node.querySelector('.node-name');
        if (nameSpan) {
            objName = nameSpan.textContent.trim() || objName;
        }
    }
    return objName;
}

/**
 * Initialize drag on pointerdown
 * @param {PointerEvent} e
 */
export function initDrag(e) {
    const selectedMesh = State.get('selectedMesh');
    if (!selectedMesh || !selectedMesh.userData.editable || selectedMesh.userData.locked) return;

    setRaycasterFromEvent(e);
    const raycaster = getRaycaster();
    
    // Find the exact point where the user clicked to position the drag plane correctly in depth
    const worldPos = new THREE.Vector3();
    selectedMesh.getWorldPosition(worldPos);

    let coplanarPoint = worldPos.clone();
    const wasVisible = selectedMesh.visible;
    selectedMesh.visible = true;
    const intersects = raycaster.intersectObject(selectedMesh, true);
    selectedMesh.visible = wasVisible;

    if (intersects.length > 0) {
        coplanarPoint.copy(intersects[0].point);
    } else {
        // Fallback to bounding box center if they clicked the handle instead of the mesh
        const box = new THREE.Box3().setFromObject(selectedMesh);
        box.getCenter(coplanarPoint);
    }

    currentEffectivePlane = getEffectivePlane(e);
    const normal = getPlaneNormal(currentEffectivePlane);
    dragPlaneObj.setFromNormalAndCoplanarPoint(normal, coplanarPoint);

    if (!raycaster.ray.intersectPlane(dragPlaneObj, dragIntersect)) return;

    State.set('isDragging', true);
    if (e.stopPropagation) e.stopPropagation();
    dragObject = selectedMesh;
    dragStart.copy(worldPos);
    dragOffset.copy(dragIntersect).sub(worldPos);

    DragGhost.create(selectedMesh);

    const canvasWrapper = $('canvas-wrapper');
    canvasWrapper.classList.add('dragging-move');

    const badge = getActiveBadge();
    if (badge) {
        let coordsSpan = badge.querySelector('.drag-coords');
        if (!coordsSpan) {
            coordsSpan = document.createElement('div');
            coordsSpan.className = 'drag-coords';
            coordsSpan.style.position = 'absolute';
            coordsSpan.style.top = 'calc(100% + 4px)';
            coordsSpan.style.left = '0';
            coordsSpan.style.whiteSpace = 'nowrap';
            coordsSpan.style.background = 'rgba(15, 15, 15, 0.4)';
            coordsSpan.style.padding = '3px 8px';
            coordsSpan.style.borderRadius = '6px';
            coordsSpan.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            coordsSpan.style.color = '#ccc';
            coordsSpan.style.fontWeight = '200'; // ultralight
            coordsSpan.style.backdropFilter = 'blur(4px)';
            badge.appendChild(coordsSpan);
        }
        coordsSpan.style.display = 'block';
        coordsSpan.innerText = `${getObjectName(dragObject)} (...)`;
    }
}

/**
 * Handle drag movement
 * @param {PointerEvent} e
 */
export function performDrag(e) {
    if (!dragObject) return;
    setRaycasterFromEvent(e);
    const raycaster = getRaycaster();
    if (!raycaster.ray.intersectPlane(dragPlaneObj, dragIntersect)) return;

    const newPos = dragIntersect.clone().sub(dragOffset);
    if (currentEffectivePlane === 'xz') newPos.y = dragStart.y;
    if (currentEffectivePlane === 'xy') newPos.z = dragStart.z;
    if (currentEffectivePlane === 'yz') newPos.x = dragStart.x;

    if (State.get('isMoveClamped')) {
        applyClamp(dragObject, newPos);
    }

    DragGhost.setPosition(newPos);
    updateSelectionPosition(newPos, dragObject);
    
    const badge = getActiveBadge();
    if (badge) {
        const coordsSpan = badge.querySelector('.drag-coords');
        if (coordsSpan) {
            const x = newPos.x.toFixed(2);
            const y = newPos.y.toFixed(2);
            const z = newPos.z.toFixed(2);
            let text = `${getObjectName(dragObject)} (`;
            if (State.get('visualZUp')) {
                if (currentEffectivePlane === 'xz') text += `x:${x}, y:${z}`;
                else if (currentEffectivePlane === 'xy') text += `x:${x}, z:${y}`;
                else if (currentEffectivePlane === 'yz') text += `z:${y}, y:${z}`;
            } else {
                if (currentEffectivePlane === 'xz') text += `x:${x}, z:${z}`;
                else if (currentEffectivePlane === 'xy') text += `x:${x}, y:${y}`;
                else if (currentEffectivePlane === 'yz') text += `y:${y}, z:${z}`;
            }
            text += ')';
            coordsSpan.innerText = text;
        }
    }
    
    // Update live coordinates based on ghost position
    EventBus.emit('statusbar:coords', { mesh: { userData: dragObject.userData, position: newPos } });
}

/**
 * End drag
 */
export function endDrag(didMove = true) {
    State.set('isDragging', false);

    if (dragObject && didMove) {
        dragObject.userData.hasBeenMoved = true;
        const finalPos = DragGhost.getPosition();
        if (finalPos) {
            updateMeshPosVec(dragObject, finalPos);
        }
    } else if (dragObject && !didMove) {
        syncSelectionEdges(dragObject);
    }

    dragObject = null;
    DragGhost.remove();

    const canvasWrapper = $('canvas-wrapper');
    canvasWrapper.classList.remove('dragging-move');

    document.querySelectorAll('.drag-coords').forEach(el => el.style.display = 'none');

    if (didMove) {
        const selectedMesh = State.get('selectedMesh');
        if (selectedMesh) {
            EventBus.emit('properties:refresh');
        }
        History.save();
    }
}

/**
 * Update mesh position by axis
 * @param {string} axis — 'x'|'y'|'z'
 * @param {number} val
 */
export function updateMeshPos(axis, val) {
    const selectedMesh = State.get('selectedMesh');
    if (!selectedMesh || selectedMesh.userData.locked) return;
    selectedMesh.position[axis] = val;
    const wire = Registry.findWireById(selectedMesh.userData.id);
    if (wire) wire.position[axis] = val;
    syncSelectionEdges(selectedMesh);
    EventBus.emit('statusbar:coords', { mesh: selectedMesh });
}

/**
 * Update mesh position from vector
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} pos
 */
function updateMeshPosVec(mesh, pos) {
    if (!mesh || mesh.userData.locked) return;
    
    const localPos = pos.clone();
    if (mesh.parent && !mesh.parent.isScene) {
        mesh.parent.worldToLocal(localPos);
    }
    
    mesh.position.copy(localPos);
    const wire = Registry.findWireById(mesh.userData.id);
    if (wire) wire.position.copy(localPos);
    syncSelectionEdges(mesh);
    EventBus.emit('statusbar:coords', { mesh });
    EventBus.emit('properties:refreshLive');
}

/**
 * Update mesh geometry by parameter key
 * @param {string} paramKey — 'w'|'h'|'d'|'r'
 * @param {*} val
 */
export function updateGeometry(paramKey, val) {
    const selectedMesh = State.get('selectedMesh');
    if (!selectedMesh || selectedMesh.userData.locked) return;
    
    const data = selectedMesh.userData;
    data.geoParams[paramKey] = parseFloat(val);
    const p = data.geoParams;
    let newGeo;
    if (data.geoType === 'box') newGeo = new THREE.BoxGeometry(p.w, p.h, p.d);
    else if (data.geoType === 'cylinder') newGeo = new THREE.CylinderGeometry(p.r, p.r, p.h, 16);
    else if (data.geoType === 'cone') newGeo = new THREE.ConeGeometry(p.r, p.h, 16);
    else if (data.geoType === 'sphere') newGeo = new THREE.SphereGeometry(p.r, 16, 16);
    if (newGeo) {
        selectedMesh.geometry.dispose();
        selectedMesh.geometry = newGeo;
        const wire = Registry.findWireById(data.id);
        if (wire) {
            wire.geometry.dispose();
            wire.geometry = new THREE.EdgesGeometry(newGeo);
        }
        syncSelectionEdges(selectedMesh);
    }
}

/**
 * Apply boundary constraints to position
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} targetPos
 */
function applyClamp(mesh, targetPos) {
    let bboxMin = new THREE.Vector3();
    let bboxMax = new THREE.Vector3();
    
    if (mesh.userData.isPersona) {
        // Personas are animated and computing their bounds exactly per-frame is too expensive.
        // We use a reasonable static approximation (0.5m x 1.7m x 0.5m).
        bboxMin.set(-0.25, 0, -0.25);
        bboxMax.set(0.25, 1.7, 0.25);
    } else if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        bboxMin.copy(box.min).multiply(mesh.scale);
        bboxMax.copy(box.max).multiply(mesh.scale);
    } else {
        return;
    }
    
    let stage = DEFAULT_CONTAINER;
    const activeId = ProjectManager.getActiveTheatreId();
    if (activeId !== 'ninguno') {
        const t = THEATRES_CATALOG.find(x => x.id === activeId);
        if (t) {
            stage = t.stage;
        }
    }
    const { width, height, depth } = stage;
    
    // Size offsets relative to origin
    const minX = -width / 2 - bboxMin.x;
    const maxX = width / 2 - bboxMax.x;
    const minY = 0 - bboxMin.y;
    const maxY = height - bboxMax.y;
    const minZ = -depth / 2 - bboxMin.z;
    const maxZ = depth / 2 - bboxMax.z;

    targetPos.x = THREE.MathUtils.clamp(targetPos.x, minX, maxX);
    targetPos.y = THREE.MathUtils.clamp(targetPos.y, minY, maxY);
    targetPos.z = THREE.MathUtils.clamp(targetPos.z, minZ, maxZ);
}
