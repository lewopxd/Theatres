// ============================================================
// DragGhost — Copia fantasma traslúcida del objeto durante
// el arrastre, para mostrar la posición original.
// ============================================================

import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { Registry } from '../core/Registry.js';
import { PersonasEngine } from './PersonasEngine.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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
        mesh.getWorldPosition(ghostGroup.position);
        mesh.getWorldQuaternion(ghostGroup.quaternion);
        mesh.getWorldScale(ghostGroup.scale);
        ghostGroup.renderOrder = 50;

        // Clone solid mesh if it has geometry
        if (mesh.userData.id === 'contenedor-escenico') {
            const ghostSolid = new THREE.Group();
            ghostSolid.userData = { ...mesh.userData };
            ghostSolid.position.set(0, 0, 0);
            ghostSolid.rotation.set(0, 0, 0);
            ghostSolid.scale.set(1, 1, 1);

            mesh.children.forEach(child => {
                let clonedChild;
                if (child.userData && child.userData.isPersona) {
                    const mixer = child.userData.mixer;
                    const bones = child.userData.bones;
                    child.userData.mixer = null;
                    child.userData.bones = null;
                    try {
                        clonedChild = SkeletonUtils.clone(child);
                    } finally {
                        child.userData.mixer = mixer;
                        child.userData.bones = bones;
                    }
                } else {
                    clonedChild = child.clone();
                }
                clonedChild.position.copy(child.position);
                clonedChild.rotation.copy(child.rotation);
                clonedChild.scale.copy(child.scale);
                ghostSolid.add(clonedChild);
            });

            ghostSolid.traverse(child => {
                if (child.material) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.35; // slightly transparent as requested
                    child.material.depthWrite = false;
                }
                child.raycast = () => {};
            });
            ghostGroup.add(ghostSolid);
        } else if (mesh.geometry) {
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
        } else if (mesh.userData.isPersona) {
            // Temporarily remove circular references to prevent JSON.stringify crash during clone()
            const mixer = mesh.userData.mixer;
            const bones = mesh.userData.bones;
            mesh.userData.mixer = null;
            mesh.userData.bones = null;
            
            let ghostSolid;
            try {
                ghostSolid = SkeletonUtils.clone(mesh);
            } finally {
                // Restore circular references immediately
                mesh.userData.mixer = mixer;
                mesh.userData.bones = bones;
            }

            ghostSolid.position.set(0, 0, 0);
            ghostSolid.rotation.set(0, 0, 0);
            ghostSolid.scale.set(1, 1, 1);
            ghostSolid.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.45;
                    child.material.depthWrite = false;
                    child.raycast = () => {};
                }
            });
            ghostGroup.add(ghostSolid);
        }

        // Clone wireframe if it exists
        if (mesh.userData.isPersona) {
            const mixer = mesh.userData.mixer;
            const bones = mesh.userData.bones;
            mesh.userData.mixer = null;
            mesh.userData.bones = null;
            let ghostWire, ghostWireHidden;
            try {
                ghostWire = SkeletonUtils.clone(mesh);
                ghostWireHidden = SkeletonUtils.clone(mesh);
            } finally {
                mesh.userData.mixer = mixer;
                mesh.userData.bones = bones;
            }

            const wire = Registry.findWireById(mesh.userData.id);
            const wireColor = wire ? wire.userData.baseColor : 0xffffff;
            
            ghostWire.position.set(0, 0, 0);
            ghostWire.rotation.set(0, 0, 0);
            ghostWire.scale.set(1, 1, 1);
            ghostWire.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = new THREE.MeshBasicMaterial({
                        color: wireColor,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.6,
                        depthWrite: false
                    });
                    child.raycast = () => {};
                }
            });
            ghostGroup.add(ghostWire);

            ghostWireHidden.position.set(0, 0, 0);
            ghostWireHidden.rotation.set(0, 0, 0);
            ghostWireHidden.scale.set(1, 1, 1);
            ghostWireHidden.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = new THREE.MeshBasicMaterial({
                        color: new THREE.Color(wireColor).multiplyScalar(0.2),
                        wireframe: true,
                        transparent: true,
                        opacity: 0.05,
                        depthWrite: false,
                        depthTest: true,
                        depthFunc: THREE.GreaterDepth,
                        polygonOffset: true,
                        polygonOffsetFactor: -1,
                        polygonOffsetUnits: -1
                    });
                    child.raycast = () => {};
                }
            });
            ghostGroup.add(ghostWireHidden);
        } else {
            const wire = Registry.findWireById(mesh.userData.id);
            if (wire && wire.geometry) {
                const wireGeo = wire.geometry.clone();
                let wireMat;
                if (wire.material) {
                    wireMat = wire.material.clone();
                    wireMat.color.copy(wire.userData.baseColor); // Ignore temporary hover white color
                    wireMat.transparent = true;
                    wireMat.opacity = 0.6;
                    wireMat.depthWrite = false;
                }
                const ghostWire = new THREE.LineSegments(wireGeo, wireMat);
                ghostWire.visible = true; // ALWAYS turn wire on for ghost
                ghostWire.raycast = () => {};
                ghostGroup.add(ghostWire);

                // Hidden part (x-ray)
                const wireMatHidden = wireMat.clone();
                wireMatHidden.color.multiplyScalar(0.2);
                wireMatHidden.opacity = 0.05;
                wireMatHidden.depthTest = true;
                wireMatHidden.depthFunc = THREE.GreaterDepth;
                wireMatHidden.polygonOffset = true;
                wireMatHidden.polygonOffsetFactor = -1;
                wireMatHidden.polygonOffsetUnits = -1;
                const ghostWireHidden = new THREE.LineSegments(wireGeo, wireMatHidden);
                ghostWireHidden.visible = true;
                ghostWireHidden.raycast = () => {};
                ghostGroup.add(ghostWireHidden);
            }
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

    get isActive() {
        return ghostGroup !== null;
    },

    /**
     * Set the position of the ghost
     * @param {THREE.Vector3} pos
     */
    setPosition(pos) {
        if (ghostGroup) {
            ghostGroup.position.copy(pos);
        }
    },

    /**
     * Get the position of the ghost
     * @returns {THREE.Vector3|null}
     */
    getPosition() {
        return ghostGroup ? ghostGroup.position.clone() : null;
    }
};
