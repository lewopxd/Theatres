// ============================================================
// MoveHandle — Cruceta 3D de arrastre para objetos seleccionados
// Aparece en el centro del objeto seleccionado (si es editable
// y no bloqueado). Arrastrar desde ella activa el modo "move".
// ============================================================

import * as THREE from 'three';
import { scene } from './SceneManager.js';

const AXIS_LENGTH = 0.35;
const SPHERE_RADIUS = 0.1;
const SPHERE_SEGMENTS = 12;
const HIT_RADIUS = 0.18; // slightly larger for easier clicking

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
const centerGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const sphereMat = new THREE.MeshBasicMaterial({
    color: SPHERE_COLOR_NORMAL,
    transparent: true,
    opacity: SPHERE_OPACITY_NORMAL,
    depthTest: false
});
const sphereMesh = new THREE.Mesh(centerGeo, sphereMat); // keeping variable name to minimize changes below
sphereMesh.renderOrder = 201;
handleGroup.add(sphereMesh);

// Hit target (invisible, larger sphere for raycasting)
const hitGeo = new THREE.SphereGeometry(HIT_RADIUS, 8, 8);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const hitMesh = new THREE.Mesh(hitGeo, hitMat);
hitMesh.name = '__moveHandle_hit__';
hitMesh.renderOrder = 202;
handleGroup.add(hitMesh);

// Axis lines
function makeAxisLine(dir, color) {
    const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(dir.x * AXIS_LENGTH, dir.y * AXIS_LENGTH, dir.z * AXIS_LENGTH)
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        linewidth: 2
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 201;
    return line;
}

// Positive and negative directions for each axis
const xPos = makeAxisLine(new THREE.Vector3(1, 0, 0), 0xff4444);
const xNeg = makeAxisLine(new THREE.Vector3(-1, 0, 0), 0xff4444);
const yPos = makeAxisLine(new THREE.Vector3(0, 1, 0), 0x44ff44);
const yNeg = makeAxisLine(new THREE.Vector3(0, -1, 0), 0x44ff44);
const zPos = makeAxisLine(new THREE.Vector3(0, 0, 1), 0x4488ff);
const zNeg = makeAxisLine(new THREE.Vector3(0, 0, -1), 0x4488ff);

handleGroup.add(xPos, xNeg, yPos, yNeg, zPos, zNeg);

// Add to scene
scene.add(handleGroup);

// Track hover state
let _isHovered = false;

// ---- Public API ----
export const MoveHandle = {
    /**
     * Show the crosshair at the mesh's position
     * @param {THREE.Mesh|null} mesh
     */
    show(mesh) {
        if (!mesh || !mesh.userData.editable || mesh.userData.locked) {
            this.hide();
            return;
        }
        handleGroup.position.copy(mesh.position);
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
        handleGroup.position.copy(mesh.position);
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
