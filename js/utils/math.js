// ============================================================
// Math Utilities — helpers para operaciones Three.js
// ============================================================

import * as THREE from 'three';

/**
 * Devuelve la normal del plano de movimiento activo
 * @param {'xz'|'xy'|'yz'} plane
 * @returns {THREE.Vector3}
 */
export function getPlaneNormal(plane) {
    if (plane === 'xz') return new THREE.Vector3(0, 1, 0);
    if (plane === 'xy') return new THREE.Vector3(0, 0, 1);
    if (plane === 'yz') return new THREE.Vector3(1, 0, 0);
    return new THREE.Vector3(0, 1, 0);
}
