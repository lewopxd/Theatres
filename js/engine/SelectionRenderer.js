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
import { cam3D, camOrthoMain } from './CameraManager.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';

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

const selectionContainerSolidTriangles = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        opacity: 1.0
    })
);
selectionContainerSolidTriangles.visible = false;
selectionGroup.add(selectionContainerSolidTriangles);



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

    if (currentSelectedMesh) {
        if (currentSelectedMesh.userData.isPersona) {
            const now = Date.now();
            if (now - lastSyncTime > 100) { // 10 FPS for bounding box updates
                syncSelectionEdges(currentSelectedMesh);
            }
        } else if (currentSelectedMesh.userData.id === 'contenedor-escenico') {
            // Re-render selection edges every frame to hide perpendicular lines dynamically
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
        selectionContainerSolidTriangles.visible = false;
        cornerDots.forEach(d => d.visible = false);
        MoveHandle.hide();
        RotationGizmo.hide();
        return;
    }

    if (mesh.userData.isPersona && mesh.userData.spawnState && mesh.userData.spawnState !== 'done') {
        selectionEdges.visible = false;
        selectionEdgesHidden.visible = false;
        selectionPersonaWire.visible = false;
        selectionContainerSolidTriangles.visible = false;
        cornerDots.forEach(d => d.visible = false);
        MoveHandle.hide();
        RotationGizmo.hide();
        return;
    }

    selectionEdges.visible = true;
    selectionEdgesHidden.visible = false;
    selectionPersonaWire.visible = false;
    selectionContainerSolidTriangles.visible = false;
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
        } else if (mesh.userData.id === 'contenedor-escenico') {
            const w = ProjectManager.currentProject.theatre.width || DEFAULT_CONTAINER.width;
            const h = ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height;
            const d = ProjectManager.currentProject.theatre.depth || DEFAULT_CONTAINER.depth;
            
            const cam = State.get('is3DMode') ? cam3D : camOrthoMain;
            const camDir = new THREE.Vector3();
            if (cam) cam.getWorldDirection(camDir);
            
            selectionEdges.geometry = createContainerSelectionGeometry(w, h, d, camDir);
            
            selectionContainerSolidTriangles.geometry.dispose();
            selectionContainerSolidTriangles.geometry = createContainerSolidTrianglesGeometry(w, h, d);
            selectionContainerSolidTriangles.visible = true;
            selectionEdgesHidden.geometry = selectionEdges.geometry;
        } else if (mesh.geometry) {
            selectionContainerSolidTriangles.visible = false;
            selectionEdges.geometry = new THREE.EdgesGeometry(mesh.geometry);
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
    mesh.getWorldPosition(selectionGroup.position);
    mesh.getWorldQuaternion(selectionGroup.quaternion);
    if (mesh.userData.isPersona) {
        selectionGroup.scale.set(1, 1, 1);
    } else {
        mesh.getWorldScale(selectionGroup.scale);
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
    mesh.getWorldPosition(selectionGroup.position);
    mesh.getWorldQuaternion(selectionGroup.quaternion);
    if (mesh.userData.isPersona) {
        selectionGroup.scale.set(1, 1, 1);
    } else {
        mesh.getWorldScale(selectionGroup.scale);
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

/**
 * Creates custom selection geometry for the scenic container.
 * Includes the 12 box edges, a floor center crosshair, floor square corners, and 8 joint corner brackets.
 */
function createContainerSelectionGeometry(width, height, depth, camDir = null) {
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    const vertices = [];

    // 1. Add 12 box edges
    const edges = [
        // Bottom ring
        [new THREE.Vector3(-halfW, -halfH, halfD), new THREE.Vector3(halfW, -halfH, halfD)],
        [new THREE.Vector3(halfW, -halfH, halfD), new THREE.Vector3(halfW, -halfH, -halfD)],
        [new THREE.Vector3(halfW, -halfH, -halfD), new THREE.Vector3(-halfW, -halfH, -halfD)],
        [new THREE.Vector3(-halfW, -halfH, -halfD), new THREE.Vector3(-halfW, -halfH, halfD)],
        // Top ring
        [new THREE.Vector3(-halfW, halfH, halfD), new THREE.Vector3(halfW, halfH, halfD)],
        [new THREE.Vector3(halfW, halfH, halfD), new THREE.Vector3(halfW, halfH, -halfD)],
        [new THREE.Vector3(halfW, halfH, -halfD), new THREE.Vector3(-halfW, halfH, -halfD)],
        [new THREE.Vector3(-halfW, halfH, -halfD), new THREE.Vector3(-halfW, halfH, halfD)],
        // Vertical pillars
        [new THREE.Vector3(-halfW, -halfH, halfD), new THREE.Vector3(-halfW, halfH, halfD)],
        [new THREE.Vector3(halfW, -halfH, halfD), new THREE.Vector3(halfW, halfH, halfD)],
        [new THREE.Vector3(halfW, -halfH, -halfD), new THREE.Vector3(halfW, halfH, -halfD)],
        [new THREE.Vector3(-halfW, -halfH, -halfD), new THREE.Vector3(-halfW, halfH, -halfD)]
    ];

    edges.forEach(([P1, P2]) => {
        vertices.push(P1.x, P1.y, P1.z);
        vertices.push(P2.x, P2.y, P2.z);
    });

    // 2. Add crosshair on the floor (centered at X=0, Z=0 on the bottom face)
    const crossSize = 0.5; // 50 cm total crosshair size
    const halfCross = crossSize / 2;
    const floorY = -halfH;

    // X-axis segment
    vertices.push(-halfCross, floorY, 0);
    vertices.push(halfCross, floorY, 0);
    // Z-axis segment
    vertices.push(0, floorY, -halfCross);
    vertices.push(0, floorY, halfCross);

    // 2b. Add tiny corners of a square surrounding the floor crosshair
    const squareSize = 0.7; // 70 cm square (larger than crosshair)
    const halfS = squareSize / 2;
    const lBracketLen = 0.05; // 5 cm length for the L-bracket arms

    const cornerSigns = [-1, 1];
    cornerSigns.forEach(sx => {
        cornerSigns.forEach(sz => {
            const cx = sx * halfS;
            const cz = sz * halfS;

            // Arm along X (pointing inwards to the center)
            vertices.push(cx, floorY, cz);
            vertices.push(cx - sx * lBracketLen, floorY, cz);

            // Arm along Z (pointing inwards to the center)
            vertices.push(cx, floorY, cz);
            vertices.push(cx, floorY, cz - sz * lBracketLen);
        });
    });

    // 3. Add corner brackets (for all 8 vertices)
    const gap = 0.12; // 12 cm gap from vertex (more separated)
    const bracketLen = 0.25; // 25 cm bracket length (larger)

    // Determine which axis is pointing most directly at/away from the camera (perpendicular to screen)
    let hideAxis = 'z';
    if (camDir) {
        const absX = Math.abs(camDir.x);
        const absY = Math.abs(camDir.y);
        const absZ = Math.abs(camDir.z);
        if (absX >= absY && absX >= absZ) {
            hideAxis = 'x';
        } else if (absY >= absX && absY >= absZ) {
            hideAxis = 'y';
        } else {
            hideAxis = 'z';
        }
    }

    const sxList = [-1, 1];
    const syList = [-1, 1];
    const szList = [-1, 1];

    sxList.forEach(sx => {
        syList.forEach(sy => {
            szList.forEach(sz => {
                const vx = sx * halfW;
                const vy = sy * halfH;
                const vz = sz * halfD;

                // Edge directions pointing inwards from this corner
                const dx = -sx;
                const dy = -sy;
                const dz = -sz;

                // The bracket vertex (where the three segments meet) is offset OUTWARDS from the main corner vertex
                const bx = vx + sx * gap;
                const by = vy + sy * gap;
                const bz = vz + sz * gap;

                // X bracket segment
                if (hideAxis !== 'x') {
                    vertices.push(bx, by, bz);
                    vertices.push(bx + dx * bracketLen, by, bz);
                }

                // Y bracket segment
                if (hideAxis !== 'y') {
                    vertices.push(bx, by, bz);
                    vertices.push(bx, by + dy * bracketLen, bz);
                }

                // Z bracket segment
                if (hideAxis !== 'z') {
                    vertices.push(bx, by, bz);
                    vertices.push(bx, by, bz + dz * bracketLen);
                }

                // Add corner triangles on the 3 faces meeting at this vertex
                const triSize = 0.08; // 8 cm triangle size
                const pX = { x: vx + dx * triSize, y: vy, z: vz };
                const pY = { x: vx, y: vy + dy * triSize, z: vz };
                const pZ = { x: vx, y: vy, z: vz + dz * triSize };

                // Shared axis lines
                vertices.push(vx, vy, vz); vertices.push(pX.x, pX.y, pX.z);
                vertices.push(vx, vy, vz); vertices.push(pY.x, pY.y, pY.z);
                vertices.push(vx, vy, vz); vertices.push(pZ.x, pZ.y, pZ.z);

                // Hypotenuse lines forming the triangles on the faces
                vertices.push(pX.x, pX.y, pX.z); vertices.push(pY.x, pY.y, pY.z); // X-Y plane
                vertices.push(pY.x, pY.y, pY.z); vertices.push(pZ.x, pZ.y, pZ.z); // Y-Z plane
                vertices.push(pX.x, pX.y, pX.z); vertices.push(pZ.x, pZ.y, pZ.z); // X-Z plane
            });
        });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
}

/**
 * Creates custom solid triangle geometry for the scenic container's corners.
 * Returns a BufferGeometry with solid triangles on the 3 faces meeting at each of the 8 vertices.
 */
function createContainerSolidTrianglesGeometry(width, height, depth) {
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    const vertices = [];
    const triSize = 0.08; // 8 cm triangle size

    const sxList = [-1, 1];
    const syList = [-1, 1];
    const szList = [-1, 1];

    sxList.forEach(sx => {
        syList.forEach(sy => {
            szList.forEach(sz => {
                const vx = sx * halfW;
                const vy = sy * halfH;
                const vz = sz * halfD;

                const dx = -sx;
                const dy = -sy;
                const dz = -sz;

                const pX = { x: vx + dx * triSize, y: vy, z: vz };
                const pY = { x: vx, y: vy + dy * triSize, z: vz };
                const pZ = { x: vx, y: vy, z: vz + dz * triSize };

                // Triangle 1 (X-Y face)
                vertices.push(vx, vy, vz);
                vertices.push(pX.x, pX.y, pX.z);
                vertices.push(pY.x, pY.y, pY.z);

                // Triangle 2 (Y-Z face)
                vertices.push(vx, vy, vz);
                vertices.push(pY.x, pY.y, pY.z);
                vertices.push(pZ.x, pZ.y, pZ.z);

                // Triangle 3 (X-Z face)
                vertices.push(vx, vy, vz);
                vertices.push(pX.x, pX.y, pX.z);
                vertices.push(pZ.x, pZ.y, pZ.z);
            });
        });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
}