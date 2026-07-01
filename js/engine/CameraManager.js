// ============================================================
// CameraManager — Cámaras y OrbitControls
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderer } from './SceneManager.js';
import { FRUSTUM_SIZE } from '../utils/constants.js';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';

export const userInteractedWithMode = {
    top: false,
    bottom: false,
    left: false,
    right: false,
    front: false,
    ortho: false,
    split: false
};
export let isProgrammaticMove = false;

// 3D Perspective camera
export const cam3D = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
cam3D.position.set(0, 8, 14);

// Orthographic cameras
function makeOrthoCam() {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
}

export const camOrthoMain = makeOrthoCam();
export const camTop = makeOrthoCam();
export const camBottom = makeOrthoCam();
export const camLeft = makeOrthoCam();
export const camRight = makeOrthoCam();
export const camFront = makeOrthoCam();
export const camIso = makeOrthoCam();

// Controls
export const ctrl3D = new OrbitControls(cam3D, renderer.domElement);
ctrl3D.target.set(0, 2, 0);
ctrl3D.enableZoom = true;

export const ctrlOrthoMain = new OrbitControls(camOrthoMain, renderer.domElement);
ctrlOrthoMain.enableRotate = false;

export const ctrlTop = new OrbitControls(camTop, renderer.domElement);
ctrlTop.enableRotate = false;

export const ctrlBottom = new OrbitControls(camBottom, renderer.domElement);
ctrlBottom.enableRotate = false;

export const ctrlLeft = new OrbitControls(camLeft, renderer.domElement);
ctrlLeft.enableRotate = false;

export const ctrlRight = new OrbitControls(camRight, renderer.domElement);
ctrlRight.enableRotate = false;

export const ctrlFront = new OrbitControls(camFront, renderer.domElement);
ctrlFront.enableRotate = false;

export const ctrlIso = new OrbitControls(camIso, renderer.domElement);
ctrlIso.enableRotate = false;

/** All controls array for bulk config */
export const allControls = [ctrl3D, ctrlOrthoMain, ctrlTop, ctrlBottom, ctrlLeft, ctrlRight, ctrlFront, ctrlIso];
allControls.forEach(c => {
    c.enableZoom = !State.get('zoomToCursor');
    c.zoomSpeed = 3.5; // Aumentado para mayor fluidez
});

EventBus.on('state:zoomToCursor', (e) => {
    const useCADZoom = e.value;
    allControls.forEach(c => {
        c.enableZoom = !useCADZoom;
        c.zoomSpeed = 3.5;
    });
});

/** All ortho controls for sync */
export const orthoControls = [ctrlOrthoMain, ctrlTop, ctrlBottom, ctrlLeft, ctrlRight, ctrlFront, ctrlIso];

/**
 * Position a camera and its control for a given mode
 */
export function setupCamPos(cam, mode, ctrl = null) {
    cam.position.set(0, 0, 0);
    cam.up.set(0, 1, 0);
    const stageH = parseFloat(State.get('stageHeight')) || 4.5;
    const centerY = stageH / 2;
    let targetY = 0;
    
    if (mode === 'top') { cam.position.set(0, 20, 0); cam.up.set(0, 0, -1); targetY = centerY; }
    else if (mode === 'bottom') { cam.position.set(0, -20, 0); cam.up.set(0, 0, 1); targetY = centerY; }
    else if (mode === 'left') { cam.position.set(-20, centerY, 0); targetY = centerY; }
    else if (mode === 'right') { cam.position.set(20, centerY, 0); targetY = centerY; }
    else if (mode === 'front') { cam.position.set(0, centerY, 20); targetY = centerY; }
    else if (mode === 'ortho') { cam.position.set(15, 15 + centerY, 15); targetY = centerY; }
    
    cam.lookAt(0, targetY, 0);
    
    if (ctrl) {
        isProgrammaticMove = true;
        ctrl.target.set(0, targetY, 0);
        ctrl.update();
        isProgrammaticMove = false;
    }
}

// Removed setUserHasMoved2DCamera

function getRequiredVerticalSize(mode, w, d, h, aspect) {
    if (mode === 'ortho') {
        const diag = Math.sqrt(w*w + d*d + h*h);
        const neededV = Math.max(diag, diag / aspect);
        return neededV * 1.15; // This is the exact formula that looked perfect before the infinite loop broke the rendering
    }
    
    let reqH, reqV;
    
    if (mode === 'top' || mode === 'bottom') {
        reqH = w; reqV = d;
    } else if (mode === 'front') {
        reqH = w; reqV = h;
    } else if (mode === 'left' || mode === 'right') {
        reqH = d; reqV = h;
    } else {
        reqH = w; reqV = h;
    }
    
    const neededV = Math.max(reqV, reqH / aspect);
    // Orthogonal 2D views get precise 10% proportional padding + 2.5m absolute padding
    return neededV * 1.1 + 2.5;
}

let isAutoFitting = false;

/**
 * Calculates optimal frustum size to fit the theatre for each view, resets targets, and resizes cameras
 */
export function autoFitTheatres(container, isSplit, force = false) {
    const modeKey = isSplit ? 'split' : State.get('active2DMode');
    if (userInteractedWithMode[modeKey] && !force) return;
    if (force) userInteractedWithMode[modeKey] = false;
    if (isAutoFitting) return;
    isAutoFitting = true;
    
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    
    const stageW = State.get('stageWidth') || 8;
    const stageD = State.get('stageDepth') || 7.5;
    const stageH = State.get('stageHeight') || 4.5;
    
    const aspect = w / h; // w/h applies to both single and split mode quadrants
    const centerY = stageH / 2;
    isProgrammaticMove = true;
    
    orthoControls.forEach(ctrl => {
        const mode = splitViews.find(v => v.ctrl === ctrl)?.mode || State.get('active2DMode');
        
        const frustum = getRequiredVerticalSize(mode, stageW, stageD, stageH, aspect);
        
        ctrl.object.userData.baseFrustumSize = frustum;
        setupCamPos(ctrl.object, mode, ctrl);
        ctrl.object.zoom = 1;
        ctrl.update();
    });
    
    isProgrammaticMove = false;
    
    // Apply the newly calculated base frustums
    resizeCameras(container, State.get('is3DMode'), isSplit);
    
    isAutoFitting = false;
}

/**
 * Resize cameras for the given container dimensions
 */
export function resizeCameras(container, is3DMode, isSplit) {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);

    const modeKey = isSplit ? 'split' : State.get('active2DMode');
    if (!is3DMode && !userInteractedWithMode[modeKey]) {
        autoFitTheatres(container, isSplit);
    }

    if (is3DMode) {
        cam3D.aspect = w / h;
        cam3D.updateProjectionMatrix();
    } else if (!isSplit) {
        const a = w / h;
        const f = camOrthoMain.userData.baseFrustumSize || FRUSTUM_SIZE;
        camOrthoMain.left = f * a / -2;
        camOrthoMain.right = f * a / 2;
        camOrthoMain.top = f / 2;
        camOrthoMain.bottom = f / -2;
        camOrthoMain.updateProjectionMatrix();
    } else {
        const hw = w / 2, hh = h / 2, a = hw / hh;
        [camTop, camLeft, camRight, camFront, camIso].forEach(c => {
            const f = c.userData.baseFrustumSize || FRUSTUM_SIZE;
            c.left = f * a / -2;
            c.right = f * a / 2;
            c.top = f / 2;
            c.bottom = f / -2;
            c.updateProjectionMatrix();
        });
    }
}

/**
 * Setup ortho sync (zoom/target shared between ortho cams)
 */
export function initOrthoSync(getIs3DMode) {
    let isSyncing = false;
    orthoControls.forEach(ctrl => {
        ctrl.addEventListener('change', () => {
            if (isProgrammaticMove) return; // Prevent any cross-sync during auto-fit setup
            
            const currentMode = State.get('isSplit') ? 'split' : State.get('active2DMode');
            userInteractedWithMode[currentMode] = true;
            
            if (isSyncing || getIs3DMode()) return;
            isSyncing = true;
            const src = ctrl.object;
            orthoControls.forEach(c => {
                if (c !== ctrl) {
                    const offset = new THREE.Vector3().copy(c.object.position).sub(c.target);
                    c.target.copy(ctrl.target);
                    c.object.position.copy(c.target).add(offset);
                    
                    c.object.zoom = src.zoom;
                    c.object.updateProjectionMatrix();
                    c.update();
                }
            });
            isSyncing = false;
        });
    });
}

// Enable Damping globally for all controls
allControls.forEach(c => {
    c.enableDamping = true;
    c.dampingFactor = 0.05;
    c.enablePan = true;
    c.enableRotate = false;
    c.enableZoom = !State.get('zoomToCursor');
    c.zoomSpeed = 3.5;
    
    // Disable rotate based on camera type
    if (c.object.isOrthographicCamera) {
        c.enableRotate = false;
    }
});

ctrl3D.enableRotate = true;

// Zoom logic is initialized externally via initZoom()
const getIs3DMode = () => State.get('is3DMode');
initOrthoSync(getIs3DMode);

// Window Resize logic
window.addEventListener('resize', () => {
    const container = document.getElementById('canvas-wrapper');
    if (container) {
        resizeCameras(container, getIs3DMode(), State.get('isSplit'));
    }
});

// Initialize default positions
setupCamPos(camTop, 'top', ctrlTop);
setupCamPos(camBottom, 'bottom', ctrlBottom);
setupCamPos(camLeft, 'left', ctrlLeft);
setupCamPos(camRight, 'right', ctrlRight);
setupCamPos(camFront, 'front', ctrlFront);
setupCamPos(camIso, 'ortho', ctrlIso);

/** Split view quadrant layout */
export const splitViews = [
    { left: 0, bottom: 0.5, width: 0.5, height: 0.5, cam: camTop, ctrl: ctrlTop, mode: 'top' },
    { left: 0.5, bottom: 0.5, width: 0.5, height: 0.5, cam: camFront, ctrl: ctrlFront, mode: 'front' },
    { left: 0, bottom: 0, width: 0.5, height: 0.5, cam: camLeft, ctrl: ctrlLeft, mode: 'left' },
    { left: 0.5, bottom: 0, width: 0.5, height: 0.5, cam: camIso, ctrl: ctrlIso, mode: 'ortho' },
];

/**
 * Updates which orthogonal control is active based on mouse position.
 * Prevents multiple controls from processing pan simultaneously.
 */
export function updateActiveOrthoControl(e, container, isSplit) {
    if (!isSplit) {
        orthoControls.forEach(c => c.enabled = (c === ctrlOrthoMain));
        return;
    }
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    
    // Normalized coordinates (0 to 1) from bottom-left
    const nx = x / w;
    const ny = 1.0 - (y / h);
    
    orthoControls.forEach(c => c.enabled = false);
    
    for (const v of splitViews) {
        if (nx >= v.left && nx <= v.left + v.width &&
            ny >= v.bottom && ny <= v.bottom + v.height) {
            v.ctrl.enabled = true;
            break;
        }
    }
}

// ============================================================
// ZOOM TO CURSOR LOGIC
// ============================================================
renderer.domElement.addEventListener('wheel', (e) => {
    if (!State.get('zoomToCursor')) return;
    
    e.preventDefault();

    const is3DMode = State.get('is3DMode');
    const isSplit = State.get('isSplit');

    let activeCtrl = null;
    let activeCam = null;
    let ndcX = 0;
    let ndcY = 0;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    if (is3DMode) {
        activeCtrl = ctrl3D;
        activeCam = cam3D;
        ndcX = (x / w) * 2 - 1;
        ndcY = -(y / h) * 2 + 1;
    } else if (!isSplit) {
        activeCtrl = ctrlOrthoMain;
        activeCam = camOrthoMain;
        ndcX = (x / w) * 2 - 1;
        ndcY = -(y / h) * 2 + 1;
    } else {
        const nx = x / w;
        const ny = 1.0 - (y / h);
        for (const v of splitViews) {
            if (nx >= v.left && nx <= v.left + v.width &&
                ny >= v.bottom && ny <= v.bottom + v.height) {
                activeCtrl = v.ctrl;
                activeCam = v.cam;
                // Calculate local NDC for the quadrant
                const localX = (nx - v.left) / v.width;
                const localY = (ny - v.bottom) / v.height;
                ndcX = localX * 2 - 1;
                ndcY = localY * 2 - 1;
                break;
            }
        }
    }

    if (!activeCtrl || !activeCam) return;

    const ndc = new THREE.Vector2(ndcX, ndcY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, activeCam);

    const target = activeCtrl.target;
    // Plane passing through the target and facing the camera
    const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCam.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, target);

    const pOld = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pOld);

    // Apply Zoom
    const zoomSpeed = 1.06;
    const zoomDelta = e.deltaY > 0 ? (1 / zoomSpeed) : zoomSpeed;

    if (activeCam.isOrthographicCamera) {
        activeCam.zoom *= zoomDelta;
        activeCam.zoom = THREE.MathUtils.clamp(activeCam.zoom, 0.01, 1000);
        activeCam.updateProjectionMatrix();
    } else {
        const offset = new THREE.Vector3().copy(activeCam.position).sub(target);
        offset.divideScalar(zoomDelta);
        if (offset.length() > 0.1 && offset.length() < 2000) {
            activeCam.position.copy(target).add(offset);
        }
    }
    
    activeCam.updateMatrixWorld();

    raycaster.setFromCamera(ndc, activeCam);
    const pNew = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pNew);

    const pan = new THREE.Vector3().copy(pOld).sub(pNew);
    
    // Disable syncing while programmatic zooming
    isProgrammaticMove = true;
    activeCam.position.add(pan);
    activeCtrl.target.add(pan);
    activeCtrl.update();
    isProgrammaticMove = false;
    
    // Manually trigger sync for ortho views if not in 3D
    if (!is3DMode) {
        const currentMode = isSplit ? 'split' : State.get('active2DMode');
        userInteractedWithMode[currentMode] = true;
        
        orthoControls.forEach(c => {
            if (c !== activeCtrl) {
                const offset = new THREE.Vector3().copy(c.object.position).sub(c.target);
                c.target.copy(activeCtrl.target);
                c.object.position.copy(c.target).add(offset);
                
                c.object.zoom = activeCam.zoom;
                c.object.updateProjectionMatrix();
                c.update();
            }
        });
    }

}, { passive: false });
