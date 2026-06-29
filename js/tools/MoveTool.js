// ============================================================
// MoveTool — Drag en planos XZ/XY/YZ
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { setRaycasterFromEvent, getRaycaster } from '../engine/RaycasterManager.js';
import { Registry } from '../core/Registry.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { History } from '../core/History.js';
import { AXIS_LABELS, DEFAULT_STAGE } from '../utils/constants.js';
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

function getEffectivePlane(e) {
    if (State.get('is3DMode')) return State.get('activePlane');
    
    let mode = State.get('active2DMode');
    if (State.get('isSplit')) {
        const container = $('canvas-wrapper');
        const rect = container.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = 1.0 - ((e.clientY - rect.top) / rect.height);
        
        if (nx < 0.5 && ny > 0.5) mode = 'top';
        else if (nx >= 0.5 && ny > 0.5) mode = 'ortho';
        else if (nx < 0.5 && ny <= 0.5) mode = 'left';
        else mode = 'right';
    }
    
    if (mode === 'top' || mode === 'bottom') return 'xz';
    if (mode === 'left' || mode === 'right') return 'yz';
    return 'xz'; // default and ortho
}

/**
 * Initialize drag on pointerdown
 * @param {PointerEvent} e
 */
export function initDrag(e) {
    const selectedMesh = State.get('selectedMesh');
    if (!selectedMesh || !selectedMesh.userData.editable || selectedMesh.userData.locked) return;

    setRaycasterFromEvent(e);
    currentEffectivePlane = getEffectivePlane(e);
    const normal = getPlaneNormal(currentEffectivePlane);
    dragPlaneObj.setFromNormalAndCoplanarPoint(normal, selectedMesh.position);

    const raycaster = getRaycaster();
    if (!raycaster.ray.intersectPlane(dragPlaneObj, dragIntersect)) return;

    State.set('isDragging', true);
    dragObject = selectedMesh;
    dragStart.copy(selectedMesh.position);
    dragOffset.copy(dragIntersect).sub(selectedMesh.position);

    // Create ghost at original position
    DragGhost.create(selectedMesh);

    const canvasWrapper = $('canvas-wrapper');
    const axisIndicator = $('axis-indicator');
    canvasWrapper.classList.add('dragging-move');
    axisIndicator.textContent = AXIS_LABELS[currentEffectivePlane];
    axisIndicator.classList.add('visible');
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

    updateMeshPosVec(dragObject, newPos);
}

/**
 * End drag
 */
export function endDrag() {
    State.set('isDragging', false);
    dragObject = null;

    // Remove ghost
    DragGhost.remove();

    const canvasWrapper = $('canvas-wrapper');
    const axisIndicator = $('axis-indicator');
    canvasWrapper.classList.remove('dragging-move');
    axisIndicator.classList.remove('visible');

    const selectedMesh = State.get('selectedMesh');
    if (selectedMesh) {
        EventBus.emit('properties:refresh');
    }
    History.save();
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
    mesh.position.copy(pos);
    const wire = Registry.findWireById(mesh.userData.id);
    if (wire) wire.position.copy(pos);
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
    if (!mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    
    const { width, height, depth } = DEFAULT_STAGE;
    
    // Size offsets relative to origin
    const minX = -width / 2 - bbox.min.x;
    const maxX = width / 2 - bbox.max.x;
    const minY = 0 - bbox.min.y;
    const maxY = height - bbox.max.y;
    const minZ = -depth / 2 - bbox.min.z;
    const maxZ = depth / 2 - bbox.max.z;

    targetPos.x = THREE.MathUtils.clamp(targetPos.x, minX, maxX);
    targetPos.y = THREE.MathUtils.clamp(targetPos.y, minY, maxY);
    targetPos.z = THREE.MathUtils.clamp(targetPos.z, minZ, maxZ);
}
