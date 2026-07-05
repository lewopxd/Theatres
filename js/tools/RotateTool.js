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

let dragObject = null;
let dragAxis = null;
let dragWorldAxis = new THREE.Vector3();
let initialQuaternion = new THREE.Quaternion();
let initialPosition = new THREE.Vector3();
let pivotPoint = new THREE.Vector3();

// Tangent-based drag (same approach as the working prototype)
let startMouse = new THREE.Vector2();
let dragTangent2D = new THREE.Vector2();

// Throttle: statusbar coords update at most once per rAF
let _statusbarPending = false;

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
    initialQuaternion.copy(selectedMesh.quaternion);
    initialPosition.copy(selectedMesh.position);

    let localAxis = new THREE.Vector3();
    if (dragAxis === 'x') localAxis.set(1, 0, 0);
    if (dragAxis === 'y') localAxis.set(0, 1, 0);
    if (dragAxis === 'z') localAxis.set(0, 0, 1);

    // Global space rotation: axis is exactly the global axis
    dragWorldAxis.copy(localAxis).normalize();

    const centerPos = RotationGizmo.getPosition();
    pivotPoint.copy(centerPos);

    // Ensure camera matrices are current before projecting
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    // Compute the 3D tangent at the hit point: cross(axis, hitVector)
    const V = new THREE.Vector3().subVectors(hitInfo.point, centerPos);
    const tangent3D = new THREE.Vector3().crossVectors(dragWorldAxis, V).normalize();

    // Project hit point and hit+tangent to screen space using the RENDERER canvas
    const rect = renderer.domElement.getBoundingClientRect();

    const pScreen = hitInfo.point.clone().project(camera);
    const ptScreen = hitInfo.point.clone().add(tangent3D).project(camera);

    const px = (pScreen.x + 1) / 2 * rect.width;
    const py = -(pScreen.y - 1) / 2 * rect.height;
    const ptx = (ptScreen.x + 1) / 2 * rect.width;
    const pty = -(ptScreen.y - 1) / 2 * rect.height;

    dragTangent2D.set(ptx - px, pty - py);

    // Fallback: if 3D tangent projection is degenerate (ring seen edge-on),
    // compute 2D tangent as perpendicular to the screen-space radius.
    if (dragTangent2D.length() < 0.5) {
        const cScreen = centerPos.clone().project(camera);
        const cx = (cScreen.x + 1) / 2 * rect.width;
        const cy = -(cScreen.y - 1) / 2 * rect.height;
        dragTangent2D.set(-(py - cy), px - cx);
    }

    dragTangent2D.normalize();
    startMouse.set(e.clientX - rect.left, e.clientY - rect.top);

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.add('dragging-rotate');
}

export function performRotateDrag(e) {
    if (!dragObject) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);

    // Tangent dot product — constant linear sensitivity, zero drift
    const mouseDelta = new THREE.Vector2().subVectors(currentMouse, startMouse);
    const moveAmount = mouseDelta.dot(dragTangent2D);

    let deltaAngle = moveAmount * 0.012;

    if (e.shiftKey) {
        const snap = THREE.MathUtils.degToRad(15);
        deltaAngle = Math.round(deltaAngle / snap) * snap;
    }

    // Rotation from initial state (recalculated each frame — zero drift)
    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(dragWorldAxis, deltaAngle);
    const newQuat = deltaQuat.clone().multiply(initialQuaternion);

    dragObject.quaternion.copy(newQuat);

    // Orbit the position around the pivot point
    const offset = new THREE.Vector3().subVectors(initialPosition, pivotPoint);
    offset.applyQuaternion(deltaQuat);
    dragObject.position.copy(pivotPoint).add(offset);

    const wire = Registry.findWireById(dragObject.userData.id);
    if (wire) {
        wire.quaternion.copy(newQuat);
        wire.position.copy(dragObject.position);
    }

    // LIGHTWEIGHT: just update transform of selection edges — no geometry rebuild
    syncSelectionTransformOnly(dragObject);

    // LIGHTWEIGHT: just copy position — no getObjectBounds recalculation
    dragObject.updateMatrixWorld();
    RotationGizmo.syncPositionOnly(dragObject);

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
    dragObject = null;
    dragAxis = null;

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.remove('dragging-rotate');
}