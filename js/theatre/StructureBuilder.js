// ============================================================
// StructureBuilder — Crea mesh + wireframe + userData
// ============================================================

import * as THREE from 'three';
import { scene } from '../engine/SceneManager.js';
import { Registry } from '../core/Registry.js';

/**
 * Create a structure (solid mesh + wireframe edges) and register it
 *
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material} mat — will be cloned
 * @param {string} wireColor — hex color string
 * @param {string} id — unique identifier
 * @param {string|null} group — parent group id
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [rotZ=0]
 * @param {string} [geoType='box'] — 'box'|'cylinder'|'cone'|'sphere'
 * @param {Object} [geoParams={}]
 * @returns {THREE.Mesh}
 */
export function createStruct(geo, mat, wireColor, id, group, x, y, z, rotZ = 0, geoType = 'box', geoParams = {}) {
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.set(x, y, z);
    if (rotZ) mesh.rotation.z = rotZ;
    mesh.userData = {
        id,
        group,
        layerVisible: true,
        locked: !!(group === 'paredes' || group === 'barras' || id === 'piso'),
        geoType,
        geoParams,
        materialPreset: 'custom',
        editable: !!group && group !== 'paredes' && group !== 'barras' && id !== 'piso'
    };
    scene.add(mesh);
    Registry.addStructure(mesh);

    const wireGeo = (mesh.userData.editable && geoType === 'box') ? new THREE.WireframeGeometry(geo) : new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(
        wireGeo,
        new THREE.LineBasicMaterial({
            color: wireColor,
            depthTest: false,
            transparent: true,
            opacity: 0.85
        })
    );
    wire.position.copy(mesh.position);
    wire.rotation.copy(mesh.rotation);
    wire.userData = {
        id,
        group,
        baseColor: new THREE.Color(wireColor),
        layerVisible: true
    };
    wire.visible = false;
    scene.add(wire);
    Registry.addWire(wire);

    return mesh;
}
