// ============================================================
// DragGhost — Copia fantasma traslúcida del objeto durante
// el arrastre, para mostrar la posición original.
// ============================================================

import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { Registry } from '../core/Registry.js';

let ghostGroup = null;

export const DragGhost = {
    /**
     * Create a translucent ghost clone of the given mesh at its current position
     * @param {THREE.Mesh} mesh — the mesh being dragged
     */
    create(mesh) {
        // Clean up any existing ghost
        this.remove();

        if (!mesh) return;

        ghostGroup = new THREE.Group();
        ghostGroup.name = '__dragGhostGroup__';
        ghostGroup.position.copy(mesh.position);
        ghostGroup.rotation.copy(mesh.rotation);
        ghostGroup.scale.copy(mesh.scale);
        ghostGroup.renderOrder = 50;

        // Clone solid mesh if it has geometry
        if (mesh.geometry) {
            const geo = mesh.geometry.clone();
            let mat;
            if (mesh.material) {
                mat = mesh.material.clone();
                mat.transparent = true;
                mat.opacity = 0.45;
                mat.depthWrite = false;
            } else {
                mat = new THREE.MeshBasicMaterial({
                    color: 0x888888,
                    transparent: true,
                    opacity: 0.45,
                    depthWrite: false
                });
            }
            const ghostSolid = new THREE.Mesh(geo, mat);
            ghostSolid.visible = true; // Always show solid on ghost
            ghostSolid.raycast = () => {};
            ghostGroup.add(ghostSolid);
        }

        // Clone wireframe if it exists
        const wire = Registry.findWireById(mesh.userData.id);
        if (wire && wire.geometry) {
            const wireGeo = wire.geometry.clone();
            let wireMat;
            if (wire.material) {
                wireMat = wire.material.clone();
                wireMat.transparent = true;
                wireMat.opacity = 0.6; // Slightly more opaque for wire to pop
                wireMat.depthWrite = false;
            }
            const ghostWire = new THREE.LineSegments(wireGeo, wireMat);
            ghostWire.visible = true; // ALWAYS turn wire on for ghost
            ghostWire.raycast = () => {};
            ghostGroup.add(ghostWire);
        }

        scene.add(ghostGroup);
    },

    /**
     * Remove the ghost from the scene and clean up
     */
    remove() {
        if (ghostGroup) {
            scene.remove(ghostGroup);
            ghostGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            ghostGroup = null;
        }
    },

    /**
     * Whether a ghost is currently active
     */
    get isActive() {
        return ghostGroup !== null;
    }
};
