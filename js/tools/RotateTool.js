import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { setRaycasterFromEvent, getRaycaster } from '../engine/RaycasterManager.js';
import { Registry } from '../core/Registry.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { History } from '../core/History.js';
import { $ } from '../utils/dom.js';
import { RotationGizmo } from '../engine/RotationGizmo.js';
import { cam3D as camera } from '../engine/CameraManager.js';

let centerScreen = new THREE.Vector2();
let lastAngle = 0;
let totalAngle = 0;
let axisSign = 1;

let dragObject = null;
let dragAxis = null;
let dragWorldAxis = new THREE.Vector3();
let initialQuaternion = new THREE.Quaternion();
let initialPosition = new THREE.Vector3();
let pivotPoint = new THREE.Vector3();

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
    
    // Project center to screen
    const pScreen = centerPos.clone().project(camera);
    const canvas = $('canvas-wrapper').querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    
    centerScreen.x = (pScreen.x + 1) / 2 * rect.width;
    centerScreen.y = -(pScreen.y - 1) / 2 * rect.height;
    
    const startMouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    lastAngle = Math.atan2(startMouse.y - centerScreen.y, startMouse.x - centerScreen.x);
    totalAngle = 0;
    
    // Calculate bulletproof axisSign by testing a small positive rotation
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

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.add('dragging-rotate');
}

export function performRotateDrag(e) {
    if (!dragObject) return;
    
    const canvas = $('canvas-wrapper').querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const currentMouse = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    
    const currentAngle = Math.atan2(currentMouse.y - centerScreen.y, currentMouse.x - centerScreen.x);
    
    let deltaAngle = currentAngle - lastAngle;
    
    // Unwrap angle to handle -PI to PI crossover
    if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
    
    lastAngle = currentAngle;
    
    // Accumulate total angle
    totalAngle += deltaAngle;
    
    let appliedAngle = totalAngle * axisSign;
    
    if (e.shiftKey) {
        const snap = THREE.MathUtils.degToRad(15);
        appliedAngle = Math.round(appliedAngle / snap) * snap;
    }

    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(dragWorldAxis, appliedAngle);
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
    
    syncSelectionEdges(dragObject);
    RotationGizmo.update();
    
    EventBus.emit('statusbar:coords', { mesh: dragObject });
}

export function endRotateDrag(didMove = true) {
    State.set('isDragging', false);

    if (dragObject && didMove) {
        EventBus.emit('properties:refreshLive');
        History.save();
    }

    RotationGizmo.setActiveAxis(null);
    dragObject = null;
    dragAxis = null;

    const canvasWrapper = $('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.classList.remove('dragging-rotate');
}