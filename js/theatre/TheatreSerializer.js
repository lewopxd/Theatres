// ============================================================
// TheatreSerializer — Serializa/deserializa el estado completo
// ============================================================

import * as THREE from 'three';
import { Registry } from '../core/Registry.js';
import { baseBgColor } from '../engine/SceneManager.js';

/**
 * Serialize the current theatre state to a plain object
 * @returns {Object}
 */
export function serializeState() {
    const structures = Registry.getStructures();
    const wires = Registry.getWires();

    return {
        m: structures.map(m => {
            const wire = wires.find(w => w.userData.id === m.userData.id);
            
            if (m.userData.isPersona) {
                return {
                    id: m.userData.id,
                    g: m.userData.group,
                    isP: true,
                    pT: m.userData.personaType,
                    name: m.userData.name,
                    h: m.userData.height,
                    p: m.position.toArray(),
                    rz: m.rotation.z,
                    wire: wire ? wire.userData.baseColor.getHex() : 0xffffff,
                    vis: m.userData.layerVisible,
                    lock: m.userData.locked
                };
            }

            return {
                id: m.userData.id,
                g: m.userData.group,
                edit: m.userData.editable,
                type: m.userData.geoType,
                geo: m.userData.geoParams,
                p: m.position.toArray(),
                rz: m.rotation.z,
                mat: {
                    c: m.material.color.getHex(),
                    o: m.material.opacity,
                    r: m.material.roughness || 0,
                    met: m.material.metalness || 0,
                    pre: m.userData.materialPreset || 'custom'
                },
                wire: wire ? wire.userData.baseColor.getHex() : 0xffffff,
                vis: m.userData.layerVisible,
                lock: m.userData.locked
            };
        }),
        bg: baseBgColor.getHex(),
        tArq: document.getElementById('tree-arq')?.innerHTML || '',
        tEsc: document.getElementById('tree-esc')?.innerHTML || '',
        tEq: document.getElementById('tree-eq')?.innerHTML || '',
        tPer: document.getElementById('tree-per')?.innerHTML || ''
    };
}

/**
 * Create a geometry from serialized params
 * @param {string} type
 * @param {Object} geo
 * @returns {THREE.BufferGeometry}
 */
export function createGeoFromParams(type, geo) {
    if (type === 'box') return new THREE.BoxGeometry(geo.w, geo.h, geo.d);
    if (type === 'cylinder') return new THREE.CylinderGeometry(geo.r, geo.r, geo.h, 16);
    if (type === 'cone') return new THREE.ConeGeometry(geo.r, geo.h, 16);
    if (type === 'sphere') return new THREE.SphereGeometry(geo.r, 16, 16);
    return new THREE.BoxGeometry(1, 1, 1);
}
