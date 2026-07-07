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
export function createStruct(geo, mat, wireColor, id, group, x, y, z, rotZ = 0, geoType = 'box', geoParams = {}, isLocal = false) {
    const mesh = new THREE.Mesh(geo, mat.clone());
    
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

    const container = Registry.findStructureById('contenedor-escenico');
    const isUserElement = (group !== 'paredes' && group !== 'barras' && id !== 'piso');

    if (container && isUserElement) {
        container.add(mesh);
        if (isLocal) {
            mesh.position.set(x, y, z);
            if (rotZ) mesh.rotation.z = rotZ;
        } else {
            // Convert world coordinates to local coordinates of container
            const localPos = container.worldToLocal(new THREE.Vector3(x, y, z));
            mesh.position.copy(localPos);
            
            const worldQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ));
            const containerWorldQuat = new THREE.Quaternion();
            container.getWorldQuaternion(containerWorldQuat);
            mesh.quaternion.copy(containerWorldQuat.clone().invert().multiply(worldQuat));
        }
    } else {
        mesh.position.set(x, y, z);
        if (rotZ) mesh.rotation.z = rotZ;
        scene.add(mesh);
    }
    Registry.addStructure(mesh);

    const wireGeo = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(
        wireGeo,
        new THREE.LineBasicMaterial({
            color: wireColor,
            depthTest: true,
            transparent: true,
            opacity: 0.85
        })
    );
    wire.position.copy(mesh.position);
    wire.quaternion.copy(mesh.quaternion);
    wire.userData = {
        id,
        group,
        baseColor: new THREE.Color(wireColor),
        layerVisible: true
    };
    wire.visible = false;
    
    if (container && isUserElement) {
        container.add(wire);
    } else {
        scene.add(wire);
    }
    Registry.addWire(wire);

    return mesh;
}
