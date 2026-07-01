// ============================================================
// MoveHandle — Punto central para indicar selección y permitir
// iniciar el arrastre haciendo clic explícitamente en él.
// Las líneas de los ejes han sido eliminadas por solicitud del usuario.
// ============================================================

import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { State } from '../core/State.js';
import { PersonasEngine } from './PersonasEngine.js';

const HIT_RADIUS = 0.25;

// Colors
const SPHERE_COLOR_NORMAL = 0xffffff;
const SPHERE_COLOR_HOVER = 0x66ccff;
const SPHERE_OPACITY_NORMAL = 0.75;
const SPHERE_OPACITY_HOVER = 1.0;

// ---- Build the crosshair group ----
const handleGroup = new THREE.Group();
handleGroup.name = '__moveHandle__';
handleGroup.visible = false;
handleGroup.renderOrder = 200;

// Central box (white, semi-transparent)
const centerGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const sphereMat = new THREE.MeshBasicMaterial({
    color: SPHERE_COLOR_NORMAL,
    transparent: true,
    opacity: SPHERE_OPACITY_NORMAL,
    depthTest: false
});
const sphereMesh = new THREE.Mesh(centerGeo, sphereMat);
sphereMesh.renderOrder = 201;
handleGroup.add(sphereMesh);

// Hit target (invisible, larger sphere for raycasting)
const hitGeo = new THREE.SphereGeometry(HIT_RADIUS, 8, 8);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const hitMesh = new THREE.Mesh(hitGeo, hitMat);
hitMesh.name = '__moveHandle_hit__';
hitMesh.renderOrder = 202;
handleGroup.add(hitMesh);

// Add to scene
scene.add(handleGroup);

// Track hover state
let _isHovered = false;

function getObjectBounds(mesh) {
    mesh.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    if (mesh.userData.isPersona) {
        const localBox = PersonasEngine.computeSkinnedBoundingBox(mesh);
        localBox.getCenter(center);
        center.applyMatrix4(mesh.matrixWorld);
        localBox.getSize(size);
        size.multiply(mesh.scale);
    } else if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        box.getCenter(center);
        center.applyMatrix4(mesh.matrixWorld);
        box.getSize(size);
        size.multiply(mesh.scale);
    } else {
        const box = new THREE.Box3().setFromObject(mesh);
        box.getCenter(center);
        box.getSize(size);
    }
    return { center, size };
}

function getHandlePosition3D(mesh) {
    const { center } = getObjectBounds(mesh);
    return center;
}

function getHandlePosition2D(mesh) {
    const { center } = getObjectBounds(mesh);
    return center;
}

// ---- Public API ----
export const MoveHandle = {
    /**
     * Show the crosshair at the mesh's position
     * @param {THREE.Mesh|null} mesh
     */
    show(mesh) {
        if (!mesh || !mesh.userData.editable || mesh.userData.locked || State.get('is3DMode')) {
            this.hide();
            return;
        }
        if (State.get('is3DMode')) {
            handleGroup.position.copy(getHandlePosition3D(mesh));
        } else {
            handleGroup.position.copy(getHandlePosition2D(mesh));
        }
        handleGroup.visible = true;
        this.setHover(false);
    },

    /**
     * Hide the crosshair
     */
    hide() {
        handleGroup.visible = false;
        this.setHover(false);
    },

    /**
     * Update crosshair position to follow a mesh
     * @param {THREE.Mesh|null} mesh
     */
    update(mesh) {
        if (!mesh || !handleGroup.visible) return;
        if (State.get('is3DMode')) {
            handleGroup.position.copy(getHandlePosition3D(mesh));
        } else {
            handleGroup.position.copy(getHandlePosition2D(mesh));
        }
    },

    /**
     * Update position directly (used during ghost drag)
     * @param {THREE.Vector3} pos
     * @param {THREE.Mesh} mesh
     */
    setPosition(pos, mesh = null) {
        if (!handleGroup.visible) return;
        
        if (mesh) {
            const offset = new THREE.Vector3();
            if (State.get('is3DMode')) {
                offset.copy(getHandlePosition3D(mesh)).sub(mesh.position);
            } else {
                offset.copy(getHandlePosition2D(mesh)).sub(mesh.position);
            }
            handleGroup.position.copy(pos).add(offset);
        } else {
            handleGroup.position.copy(pos);
        }
    },

    /**
     * Test if a raycaster hits the handle's center sphere
     * @param {THREE.Raycaster} raycaster
     * @returns {boolean}
     */
    hitTest(raycaster) {
        if (!handleGroup.visible) return false;
        const intersects = raycaster.intersectObject(hitMesh, false);
        return intersects.length > 0;
    },

    /**
     * Set hover state (glow effect)
     * @param {boolean} hovered
     */
    setHover(hovered) {
        if (_isHovered === hovered) return;
        _isHovered = hovered;
        if (hovered) {
            sphereMat.color.setHex(SPHERE_COLOR_HOVER);
            sphereMat.opacity = SPHERE_OPACITY_HOVER;
        } else {
            sphereMat.color.setHex(SPHERE_COLOR_NORMAL);
            sphereMat.opacity = SPHERE_OPACITY_NORMAL;
        }
    },

    /**
     * Whether the handle is currently visible
     */
    get isVisible() {
        return handleGroup.visible;
    },

    /**
     * Whether the handle is currently hovered
     */
    get isHovered() {
        return _isHovered;
    }
};
