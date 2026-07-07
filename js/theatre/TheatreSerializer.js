// ============================================================
// TheatreSerializer — Serializa/deserializa el estado completo
// Adapted for new tree-container based layout
// ============================================================

import * as THREE from 'three';
import { Registry } from '../core/Registry.js';
import { baseBgColor } from '../engine/SceneManager.js';
import { State } from '../core/State.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';

/**
 * Serialize the current theatre state to a plain object
 * @returns {Object}
 */
export function serializeState() {
    const structures = Registry.getStructures();
    const wires = Registry.getWires();

    const customStructures = structures.filter(m => 
        m.userData.id !== 'piso' && 
        m.userData.group !== 'paredes' && 
        m.userData.group !== 'barras'
    );

    return {
        m: customStructures.map(m => {
            const wire = wires.find(w => w.userData.id === m.userData.id);
            
            if (m.userData.isFolder) {
                return {
                    id: m.userData.id,
                    g: m.userData.group,
                    isFolder: true,
                    name: m.userData.name,
                    vis: m.userData.layerVisible,
                    lock: m.userData.locked
                };
            }

            if (m.userData.isPersona) {
                return {
                    id: m.userData.id,
                    g: m.userData.group,
                    isP: true,
                    pT: m.userData.personaType,
                    name: m.userData.name,
                    h: m.userData.height,
                    p: [
                        m.position.x, 
                        m.userData.hasBeenMoved ? m.position.y : (
                            (m.parent && !m.parent.isScene) 
                                ? -(ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height) / 2 
                                : 0
                        ),
                        m.position.z
                    ],
                    rot: [m.rotation.x, m.rotation.y, m.rotation.z],
                    cSkin: m.userData.useCustomSkin || false,
                    cColor: m.userData.customSkinColor || null,
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
                rot: [m.rotation.x, m.rotation.y, m.rotation.z],
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
        activeCategory: State.get('activeCategory') || 'arquitectura',
        activeTheaterId: ProjectManager.getActiveTheatreId(),
        hasContainer: ProjectManager.currentProject.theatre.hasContainer,
        containerDims: {
            w: ProjectManager.currentProject.theatre.width || DEFAULT_CONTAINER.width,
            h: ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height,
            d: ProjectManager.currentProject.theatre.depth || DEFAULT_CONTAINER.depth,
            g: ProjectManager.currentProject.theatre.grid || DEFAULT_CONTAINER.grid,
            p: (function() {
                const cg = Registry.findStructureById('contenedor-escenico');
                return cg ? cg.position.toArray() : [0, (ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height) / 2, 0];
            })(),
            rot: (function() {
                const cg = Registry.findStructureById('contenedor-escenico');
                return cg ? [cg.rotation.x, cg.rotation.y, cg.rotation.z] : [0, 0, 0];
            })()
        }
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
