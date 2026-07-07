import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { setRaycasterFromEvent, getRaycaster } from '../engine/RaycasterManager.js';
import { Registry } from '../core/Registry.js';
import { syncSelectionEdges, syncSelectionTransformOnly } from '../engine/SelectionRenderer.js';
import { History } from '../core/History.js';
import { $ } from '../utils/dom.js';
import { RotationGizmo } from '../engine/RotationGizmo.js';
import { cam3D as camera } from '../engine/CameraManager.js';
import { renderer } from '../engine/SceneManager.js';
import { GizmoDebugWindow } from '../ui/GizmoDebugWindow.js';

let dragObject = null;
let dragAxis = null;
let dragWorldAxis = new THREE.Vector3();
let initialQuaternion = new THREE.Quaternion();
let initialPosition = new THREE.Vector3();
let pivotPoint = new THREE.Vector3();
let initialGizmoQuaternion = new THREE.Quaternion();

// "Steering wheel" atan2 — tracks angular position around gizmo center on screen.
// Accumulates without limit: can rotate 360°, 720°, etc.
let centerScreen = new THREE.Vector2();
let lastAngle = 0;
let totalAngle = 0;
let axisSign = 1;
let startAngle3D = 0;

// Throttle: statusbar coords update at most once per rAF
let _statusbarPending = false;

function getActiveBadge() {
    if (!State.get('isSplit')) return document.getElementById('single-badge');
    return document.querySelector('.split-badge.tl');
}

export function initRotateDrag(e) {
    const selectedMesh = State.get('selectedMesh');
    if (!selectedMesh || !selectedMesh.userData.editable || selectedMesh.userData.locked || !State.get('is3DMode')) return;

    setRaycasterFromEvent(e);
    const raycaster = getRaycaster();

    const hitInfo = RotationGizmo.hitTest(raycaster);
    if (!hitInfo) return;

    State.set('isDragging', true);
    if (e.stopPropagation) e.stopPropagation();

    dragObject = selectedMesh;
    dragAxis = hitInfo.axis;
    RotationGizmo.setActiveAxis(hitInfo.halfId);
    selectedMesh.getWorldQuaternion(initialQuaternion);
    selectedMesh.getWorldPosition(initialPosition);

    if (typeof GizmoDebugWindow !== 'undefined' && GizmoDebugWindow.isGizmoRotateMode()) {
        initialGizmoQuaternion.copy(RotationGizmo.getGroup().quaternion);
    }
    
    if (RotationGizmo.getCenterSphereGroup) {
        RotationGizmo.getCenterSphereGroup().quaternion.identity();
    }
    if (RotationGizmo.setDashedLineDragAngle) {
        RotationGizmo.setDashedLineDragAngle(0);
    }

    let localAxis = new THREE.Vector3();
    if (dragAxis === 'x') localAxis.set(1, 0, 0);
    if (dragAxis === 'y') localAxis.set(0, 1, 0);
    if (dragAxis === 'z') localAxis.set(0, 0, 1);

    dragWorldAxis.copy(localAxis).normalize();

    const centerPos = RotationGizmo.getPosition();
    pivotPoint.copy(centerPos);

    // Ensure camera matrices are current before projecting
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    // Project gizmo center to screen pixels (using RENDERER canvas)
    const rect = renderer.domElement.getBoundingClientRect();
    const pScreen = centerPos.clone().project(camera);

    centerScreen.x = (pScreen.x + 1) / 2 * rect.width;
    centerScreen.y = -(pScreen.y - 1) / 2 * rect.height;

    // Start mouse in canvas-local coords
    const startMouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    lastAngle = Math.atan2(startMouse.y - centerScreen.y, startMouse.x - centerScreen.x);
    totalAngle = 0;

    // Compute axisSign: determines which screen rotation direction maps to
    // positive 3D rotation. Done by testing a tiny positive 3D rotation and
    // checking which direction it moves the hit point on screen.
    const testQuat = new THREE.Quaternion().setFromAxisAngle(dragWorldAxis, 0.01);
    const hitVector = new THREE.Vector3().subVectors(hitInfo.point, centerPos);
    hitVector.applyQuaternion(testQuat);
    const newHitPoint = centerPos.clone().add(hitVector);

    const pScreenStart = hitInfo.point.clone().project(camera);
    const pScreenNew = newHitPoint.clone().project(camera);

    const pxStart = (pScreenStart.x + 1) / 2 * rect.width;
    const pyStart = -(pScreenStart.y - 1) / 2 * rect.height;
    const pxNew = (pScreenNew.x + 1) / 2 * rect.width;
    const pyNew = -(pScreenNew.y - 1) / 2 * rect.height;

    const angleStart = Math.atan2(pyStart - centerScreen.y, pxStart - centerScreen.x);
    const angleNew = Math.atan2(pyNew - centerScreen.y, pxNew - centerScreen.x);

    let deltaAngleTest = angleNew - angleStart;
    if (deltaAngleTest > Math.PI) deltaAngleTest -= Math.PI * 2;
    if (deltaAngleTest < -Math.PI) deltaAngleTest += Math.PI * 2;

    axisSign = deltaAngleTest > 0 ? 1 : -1;

    if (RotationGizmo.getStartAngle3D) {
        startAngle3D = RotationGizmo.getStartAngle3D(hitInfo.point, dragAxis);
    }

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.add('dragging-rotate');

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
            coordsSpan.style.fontWeight = '200';
            coordsSpan.style.backdropFilter = 'blur(4px)';
            badge.appendChild(coordsSpan);
        }
        coordsSpan.style.display = 'block';
        coordsSpan.innerText = `Rotando...`;
    }
}

export function performRotateDrag(e) {
    if (!dragObject) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);

    // "Steering wheel": atan2 angle from gizmo center to mouse
    const currentAngle = Math.atan2(currentMouse.y - centerScreen.y, currentMouse.x - centerScreen.x);

    // Frame-to-frame delta with unwrapping (handles -PI ↔ PI crossover)
    let deltaAngle = currentAngle - lastAngle;
    if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

    // Clamp per-frame delta: prevents edge-on instability.
    // When a ring is seen edge-on, the projected center is very close to the
    // mouse, and tiny pixel movements cause huge atan2 jumps.
    // 30°/frame at 60fps = 1800°/sec max — far beyond human drag speed.
    const MAX_DELTA = Math.PI / 6;
    if (deltaAngle > MAX_DELTA) deltaAngle = MAX_DELTA;
    if (deltaAngle < -MAX_DELTA) deltaAngle = -MAX_DELTA;

    lastAngle = currentAngle;

    // Accumulate — no limit: can spin 360°, 720°, ∞
    totalAngle += deltaAngle;

    let appliedAngle = totalAngle * axisSign;

    if (e.shiftKey) {
        const snap = THREE.MathUtils.degToRad(15);
        appliedAngle = Math.round(appliedAngle / snap) * snap;
    }

    // Rotation from initial state (recalculated each frame — zero drift)
    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(dragWorldAxis, appliedAngle);

    if (typeof GizmoDebugWindow !== 'undefined' && GizmoDebugWindow.isGizmoRotateMode()) {
        // === DEBUG MODE: ROTATE GIZMO ONLY ===
        const newGizmoQuat = deltaQuat.clone().multiply(initialGizmoQuaternion);
        RotationGizmo.getGroup().quaternion.copy(newGizmoQuat);
        GizmoDebugWindow.updateAngles(new THREE.Euler().setFromQuaternion(newGizmoQuat));
    } else {
        // === NORMAL MODE: ROTATE OBJECT ===
        const newWorldQuat = deltaQuat.clone().multiply(initialQuaternion);

        // Orbit the position around the pivot point in world space
        const offset = new THREE.Vector3().subVectors(initialPosition, pivotPoint);
        offset.applyQuaternion(deltaQuat);
        const newWorldPos = pivotPoint.clone().add(offset);

        // Convert world position and world quaternion to parent local space if nested
        let finalLocalQuat = newWorldQuat.clone();
        let finalLocalPos = newWorldPos.clone();

        if (dragObject.parent && !dragObject.parent.isScene) {
            const parentWorldQuat = new THREE.Quaternion();
            dragObject.parent.getWorldQuaternion(parentWorldQuat);
            finalLocalQuat = parentWorldQuat.clone().invert().multiply(newWorldQuat);
            finalLocalPos = dragObject.parent.worldToLocal(newWorldPos.clone());
        }

        dragObject.quaternion.copy(finalLocalQuat);
        dragObject.position.copy(finalLocalPos);

        const wire = Registry.findWireById(dragObject.userData.id);
        if (wire) {
            wire.quaternion.copy(finalLocalQuat);
            wire.position.copy(finalLocalPos);
        }

        // LIGHTWEIGHT: just update transform of selection edges — no geometry rebuild
        syncSelectionTransformOnly(dragObject);

        // LIGHTWEIGHT: just copy position — no getObjectBounds recalculation
        dragObject.updateMatrixWorld();
        RotationGizmo.syncPositionOnly(dragObject);
        
        if (RotationGizmo.getCenterSphereGroup) {
            RotationGizmo.getCenterSphereGroup().quaternion.copy(deltaQuat);
        }
        if (RotationGizmo.setDashedLineDragAngle) {
            RotationGizmo.setDashedLineDragAngle(appliedAngle);
        }
        if (RotationGizmo.updateHUD) {
            let deltaAngle3D = appliedAngle;
            if (dragAxis === 'x') deltaAngle3D = -deltaAngle3D;
            RotationGizmo.updateHUD(dragAxis, startAngle3D, deltaAngle3D, e.clientX, e.clientY);
        }
        
        const badge = getActiveBadge();
        if (badge) {
            const coordsSpan = badge.querySelector('.drag-coords');
            if (coordsSpan) {
                const euler = new THREE.Euler().setFromQuaternion(dragObject.quaternion, 'YXZ');
                const rx = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
                const ry = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
                const rz = THREE.MathUtils.radToDeg(euler.z).toFixed(1);
                coordsSpan.innerText = `X: ${rx}° | Y: ${ry}° | Z: ${rz}°`;
            }
        }
    }

    State.set('isDirty', true);

    // Throttle statusbar update to at most once per animation frame
    if (!_statusbarPending) {
        _statusbarPending = true;
        requestAnimationFrame(() => {
            _statusbarPending = false;
            if (dragObject) {
                EventBus.emit('statusbar:coords', { mesh: dragObject });
            }
        });
    }
}

export function endRotateDrag(didMove = true) {
    State.set('isDragging', false);

    if (dragObject && didMove) {
        // Full sync now that drag is over — rebuilds geometry for final state
        syncSelectionEdges(dragObject);
        RotationGizmo.update();
        EventBus.emit('properties:refreshLive');
        History.save();
    }

    RotationGizmo.setActiveAxis(null);
    if (RotationGizmo.updateHUD) RotationGizmo.updateHUD(null);
    dragObject = null;
    dragAxis = null;

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.remove('dragging-rotate');
    
    const badge = getActiveBadge();
    if (badge) {
        const coordsSpan = badge.querySelector('.drag-coords');
        if (coordsSpan) coordsSpan.style.display = 'none';
    }
}