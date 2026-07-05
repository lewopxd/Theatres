// ============================================================
// SelectionRenderer — Edges de selección (highlight wireframe)
// ============================================================

import { State } from '../core/State.js';
import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { Registry } from '../core/Registry.js';
import { EventBus } from '../core/EventBus.js';
import { MoveHandle } from './MoveHandle.js';
import { RotationGizmo } from './RotationGizmo.js';
import { PersonasEngine } from './PersonasEngine.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Create selection edges mesh
const selectionGroup = new THREE.Group();
selectionGroup.name = '__selectionGroup__';
selectionGroup.renderOrder = 100;
scene.add(selectionGroup);

const selectionEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineDashedMaterial({
        color: 0xffffff,
        depthTest: false,
        transparent: true,
        opacity: 1.0,
        linewidth: 2,
        dashSize: 0.1,
        gapSize: 0.05
    })
);
selectionEdges.visible = false;
selectionGroup.add(selectionEdges);

const selectionEdgesHidden = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineDashedMaterial({
        color: 0xff4500, // orange-red
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
        dashSize: 0.1,
        gapSize: 0.05
    })
);
selectionEdgesHidden.visible = false;
selectionGroup.add(selectionEdgesHidden);

const selectionPersonaWire = new THREE.Group();
selectionPersonaWire.visible = false;
selectionGroup.add(selectionPersonaWire);



// Create 8 corner dots + 12 midpoint dots for the 2D bounding box
const cornerDots = [];
const dotGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
for (let i = 0; i < 20; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.visible = false;
    dot.renderOrder = 101;
    selectionGroup.add(dot);
    cornerDots.push(dot);
}

/**
 * Sync selection edges to match the given mesh
 * @param {THREE.Mesh|null} mesh
 */
import { DragGhost } from './DragGhost.js';

let currentSelectedMesh = null;
let lastSyncTime = 0;

// === DEBUG: contadores globales para ver cuántas veces se llama syncSelectionEdges
// y cuánto tarda cada llamada, fuera del contexto del drag (por ejemplo desde updateLoop)
let __debugSyncCallCount = 0;
let __debugSyncCallTotal = 0;

export function updateLoop() {
    // Prevent flickering: don't sync if dragging (ghost is active)
    if (DragGhost.isActive) return;

    if (currentSelectedMesh && currentSelectedMesh.userData.isPersona) {
        const now = Date.now();
        if (now - lastSyncTime > 100) { // 10 FPS for bounding box updates
            syncSelectionEdges(currentSelectedMesh);
        }
    }
}

export function syncSelectionEdges(mesh) {
    // === DEBUG: timer general de toda la función ===
    const __syncStart = performance.now();

    currentSelectedMesh = mesh;
    lastSyncTime = Date.now();

    if (!mesh) {
        selectionEdges.visible = false;
        selectionEdgesHidden.visible = false;
        selectionPersonaWire.visible = false;
        cornerDots.forEach(d => d.visible = false);
        MoveHandle.hide();
        RotationGizmo.hide();
        return;
    }

    selectionEdges.visible = true;
    selectionEdgesHidden.visible = false;
    selectionPersonaWire.visible = false;
    selectionEdges.geometry.dispose();

    const is3DMode = State.get('is3DMode');

    if (is3DMode) {
        const wire = Registry.findWireById(mesh.userData.id);
        const color = wire ? wire.userData.baseColor : new THREE.Color(0xffffff);

        // 3D Mode: wireframe edges matching the object's geometry
        if (mesh.userData.isPersona) {
            // === DEBUG: timer específico del bloque de reconstrucción de persona ===
            const __personaStart = performance.now();
            let __skinnedMeshCount = 0;
            let __regularMeshCount = 0;

            selectionEdges.visible = false;
            selectionPersonaWire.visible = true;
            selectionPersonaWire.clear(); // remove old children

            const wireMat = new THREE.MeshBasicMaterial({
                color: color,
                wireframe: true,
                transparent: true,
                opacity: 1.0
            });

            const personaWireMesh = new THREE.Group();
            const personaWireHidden = new THREE.Group();

            mesh.traverse(child => {
                if (child.isSkinnedMesh) {
                    __skinnedMeshCount++; // === DEBUG ===
                    const wire = new THREE.SkinnedMesh(child.geometry, wireMat);
                    wire.bindMode = child.bindMode;
                    wire.bindMatrix.copy(child.bindMatrix);
                    wire.skeleton = child.skeleton;
                    // Position relative to the group
                    wire.position.copy(child.position);
                    wire.rotation.copy(child.rotation);
                    wire.scale.copy(child.scale);
                    personaWireMesh.add(wire);

                    const hiddenMat = new THREE.MeshBasicMaterial({
                        color: color.clone().multiplyScalar(0.2),
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
                    const hidden = new THREE.SkinnedMesh(child.geometry, hiddenMat);
                    hidden.bindMode = child.bindMode;
                    hidden.bindMatrix.copy(child.bindMatrix);
                    hidden.skeleton = child.skeleton;
                    hidden.position.copy(child.position);
                    hidden.rotation.copy(child.rotation);
                    hidden.scale.copy(child.scale);
                    personaWireHidden.add(hidden);
                } else if (child.isMesh) {
                    __regularMeshCount++; // === DEBUG ===
                    const wire = new THREE.Mesh(child.geometry, wireMat);
                    wire.position.copy(child.position);
                    wire.rotation.copy(child.rotation);
                    wire.scale.copy(child.scale);
                    personaWireMesh.add(wire);
                }
            });

            // The group itself shouldn't have transforms since selectionGroup will follow the mesh's transforms
            personaWireMesh.position.set(0, 0, 0);
            personaWireMesh.rotation.set(0, 0, 0);
            personaWireMesh.scale.set(1, 1, 1);

            personaWireHidden.position.set(0, 0, 0);
            personaWireHidden.rotation.set(0, 0, 0);
            personaWireHidden.scale.set(1, 1, 1);

            selectionPersonaWire.add(personaWireMesh);
            selectionPersonaWire.add(personaWireHidden);

            // === DEBUG: reporte del bloque persona ===
            const __personaTime = performance.now() - __personaStart;
            if (__personaTime > 1) {
                console.warn(
                    `[SYNC DEBUG] Reconstrucción wireframe PERSONA: ${__personaTime.toFixed(2)}ms | ` +
                    `SkinnedMesh clonados: ${__skinnedMeshCount} | Mesh normales: ${__regularMeshCount}`
                );
            }
        } else if (mesh.geometry) {
            selectionEdges.geometry = (mesh.userData.geoType === 'box') ? new THREE.WireframeGeometry(mesh.geometry) : new THREE.EdgesGeometry(mesh.geometry);
            selectionEdgesHidden.geometry = selectionEdges.geometry;
        } else {
            const box = new THREE.Box3().setFromObject(mesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            selectionEdges.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
            selectionEdgesHidden.geometry = selectionEdges.geometry;
        }

        // Remove depthTest: false so normal selection isn't always on top
        selectionEdges.material.depthTest = true;
        selectionEdges.material.color.copy(color);
        selectionEdges.material.opacity = 1.0;
        selectionEdges.material.dashSize = 1000; // effectively solid

        if (!mesh.userData.isPersona) {
            selectionEdgesHidden.material.color.copy(color).multiplyScalar(0.2);
            selectionEdgesHidden.material.opacity = 0.05;
            selectionEdgesHidden.visible = true;
        }

        selectionEdges.material.gapSize = 0;
        cornerDots.forEach(d => d.visible = false);
    } else {
        // 2D Mode: Dashed bounding box with corner/midpoint dots
        let boxGeo;
        let w, h, d;
        let yOffset = 0;

        if (mesh.userData.isPersona) {
            const box = PersonasEngine.computeSkinnedBoundingBox(mesh);
            box.min.multiply(mesh.scale);
            box.max.multiply(mesh.scale);
            w = box.max.x - box.min.x;
            h = box.max.y - box.min.y;
            d = box.max.z - box.min.z;
            boxGeo = new THREE.BoxGeometry(w, h, d);

            // Personas local box is usually centered differently than raw geometry bounding boxes.
            // The BoxGeometry is centered around origin. We must translate the geometry to align with the actual local box.
            const center = new THREE.Vector3();
            box.getCenter(center);
            boxGeo.translate(center.x, center.y, center.z);
            yOffset = 0; // translation already handled
        } else if (mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            w = box.max.x - box.min.x;
            h = box.max.y - box.min.y;
            d = box.max.z - box.min.z;
            boxGeo = new THREE.BoxGeometry(w, h, d);
        } else {
            const box = new THREE.Box3().setFromObject(mesh);
            box.min.sub(mesh.position);
            box.max.sub(mesh.position);
            w = box.max.x - box.min.x;
            h = box.max.y - box.min.y;
            d = box.max.z - box.min.z;
            boxGeo = new THREE.BoxGeometry(w, h, d);
        }
        if (yOffset !== 0) {
            boxGeo.translate(0, yOffset, 0);
        }

        selectionEdges.geometry = new THREE.EdgesGeometry(boxGeo);
        boxGeo.dispose();

        // Compute line distances for dashed material to work
        selectionEdges.computeLineDistances();

        selectionEdges.material.color.setHex(0xffffff);
        selectionEdges.material.opacity = 0.5;
        selectionEdges.material.dashSize = 0.15;
        selectionEdges.material.gapSize = 0.1;

        // Position the 20 dots in LOCAL space (relative to the group)
        const hw = w / 2;
        const hh = h / 2;
        const hd = d / 2;

        let boxCenter = new THREE.Vector3(0, yOffset, 0);
        if (mesh.userData.isPersona) {
            const box = PersonasEngine.computeSkinnedBoundingBox(mesh);
            box.min.multiply(mesh.scale);
            box.max.multiply(mesh.scale);
            box.getCenter(boxCenter);
        }

        const pts = [
            // 8 corners
            new THREE.Vector3(-hw + boxCenter.x, -hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, -hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(-hw + boxCenter.x, hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(-hw + boxCenter.x, -hh + boxCenter.y, hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, -hh + boxCenter.y, hd + boxCenter.z),
            new THREE.Vector3(-hw + boxCenter.x, hh + boxCenter.y, hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, hh + boxCenter.y, hd + boxCenter.z),

            // 12 midpoints of edges
            new THREE.Vector3(boxCenter.x, -hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(boxCenter.x, hh + boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(boxCenter.x, -hh + boxCenter.y, hd + boxCenter.z),
            new THREE.Vector3(boxCenter.x, hh + boxCenter.y, hd + boxCenter.z),

            new THREE.Vector3(-hw + boxCenter.x, boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, boxCenter.y, -hd + boxCenter.z),
            new THREE.Vector3(-hw + boxCenter.x, boxCenter.y, hd + boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, boxCenter.y, hd + boxCenter.z),

            new THREE.Vector3(-hw + boxCenter.x, -hh + boxCenter.y, boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, -hh + boxCenter.y, boxCenter.z),
            new THREE.Vector3(-hw + boxCenter.x, hh + boxCenter.y, boxCenter.z),
            new THREE.Vector3(hw + boxCenter.x, hh + boxCenter.y, boxCenter.z)
        ];

        for (let i = 0; i < 20; i++) {
            cornerDots[i].position.copy(pts[i]);
            cornerDots[i].visible = true;
        }
    }

    // Position the group at the mesh's world transform
    selectionGroup.position.copy(mesh.position);
    selectionGroup.rotation.copy(mesh.rotation);
    if (mesh.userData.isPersona) {
        selectionGroup.scale.set(1, 1, 1);
    } else {
        selectionGroup.scale.copy(mesh.scale);
    }

    // Keep move handle synced
    MoveHandle.update(mesh);
    RotationGizmo.update(mesh);

    // === DEBUG: reporte total de la función, con contador acumulado global ===
    const __syncTotal = performance.now() - __syncStart;
    __debugSyncCallCount++;
    __debugSyncCallTotal += __syncTotal;
    if (__syncTotal > 2 && typeof window !== 'undefined' && window.__TECAL_DEBUG_ROTATE === true) {
        console.warn(
            `[SYNC DEBUG] syncSelectionEdges TOTAL: ${__syncTotal.toFixed(2)}ms | ` +
            `mesh: "${mesh.userData.id || mesh.name}" | isPersona: ${!!mesh.userData.isPersona} | ` +
            `is3DMode: ${is3DMode} | llamada #${__debugSyncCallCount} | promedio histórico: ${(__debugSyncCallTotal / __debugSyncCallCount).toFixed(2)}ms`
        );
    }
}

/**
 * Lightweight transform sync — only copies position/rotation/scale from the mesh
 * to the selectionGroup WITHOUT disposing/rebuilding geometry.
 * Use during drag operations where the object's shape hasn't changed.
 * @param {THREE.Mesh} mesh
 */
export function syncSelectionTransformOnly(mesh) {
    if (!mesh) return;
    selectionGroup.position.copy(mesh.position);
    selectionGroup.rotation.copy(mesh.rotation);
    if (mesh.userData.isPersona) {
        selectionGroup.scale.set(1, 1, 1);
    } else {
        selectionGroup.scale.copy(mesh.scale);
    }
}

/**
 * Update the position of the selection edges and move handle without full resync
 * Useful when dragging the ghost instead of the real mesh.
 * @param {THREE.Mesh} mesh
 */
export function updateSelectionPosition(pos, mesh = null) {
    selectionGroup.position.copy(pos);
    MoveHandle.setPosition(pos, mesh);

    // Hide solid selection wire during drag so the translucent ghost is visible
    if (mesh && mesh.userData.isPersona) {
        selectionPersonaWire.visible = false;
    } else {
        selectionEdges.visible = false;
        selectionEdgesHidden.visible = false;
    }
}