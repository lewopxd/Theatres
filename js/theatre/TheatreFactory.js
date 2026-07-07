// ============================================================
// TheatreFactory — Crea geometrías de un teatro a partir de medidas
// ============================================================

import * as THREE from 'three';
import { scene, applyLayerVisibility } from '../engine/SceneManager.js';
import { Registry } from '../core/Registry.js';
import { State } from '../core/State.js';
import { createStruct } from './StructureBuilder.js';
import { CADDimension } from './CADDimensions.js';
import { DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';
import { ProjectManager } from '../core/ProjectManager.js';

let currentTheatreMeshes = [];
let currentTheatreDims = [];

/**
 * Build a theatre from dimensions
 * @param {Object} [config] — overrides for DEFAULT_CONTAINER
 * @returns {{ structures: THREE.Mesh[], dimensions: CADDimension[] }}
 */
export function buildTheatre(config = {}) {
    const {
        width = DEFAULT_CONTAINER.width,
        height = DEFAULT_CONTAINER.height,
        depth = DEFAULT_CONTAINER.depth,
        wallThickness = DEFAULT_CONTAINER.wallThickness,
        barCount = DEFAULT_CONTAINER.barCount,
        barRadius = DEFAULT_CONTAINER.barRadius,
    } = config;

    // Remove existing theatre geometry if present
    if (currentTheatreMeshes.length > 0) {
        currentTheatreMeshes.forEach(m => {
            const wire = Registry.findWireById(m.userData.id);
            if (wire) {
                scene.remove(wire);
                if (wire.material) wire.material.dispose();
                Registry.removeWire(wire);
            }
            scene.remove(m);
            if (m.material) m.material.dispose();
            if (m.geometry) m.geometry.dispose();
            Registry.removeStructure(m);
        });
        currentTheatreMeshes = [];
    }

    if (currentTheatreDims.length > 0) {
        currentTheatreDims.forEach(d => {
            d.dispose();
            Registry.removeDimension(d);
        });
        currentTheatreDims = [];
    }

    const activeTheaterId = ProjectManager.getActiveTheatreId();
    const hasContainer = ProjectManager.currentProject.theatre.hasContainer;

    if (config && config.isEmpty) {
        if (activeTheaterId === 'ninguno' && !hasContainer) {
            return { meshes: [], dimensions: [] };
        }
    }

    const meshes = [];
    const dims = [];

    // 1. RENDER CONTAINER WIREFRAME (If hasContainer is true)
    if (hasContainer) {
        const cWidth = DEFAULT_CONTAINER.width;
        const cHeight = DEFAULT_CONTAINER.height;
        const cDepth = DEFAULT_CONTAINER.depth;

        // Create container group containing lines and solid corner triangles in light CAD grey
        const containerGroup = new THREE.Group();
        containerGroup.position.set(0, cHeight / 2, 0);
        containerGroup.userData = { 
            id: 'contenedor-escenico', 
            group: 'paredes', 
            layerVisible: true,
            editable: true,
            locked: false
        };

        // 1. Lines (edges, floor crosshair, and floor corners)
        const edgesGeo = createContainerNormalGeometry(cWidth, cHeight, cDepth);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xb0bec5 }); // light CAD grey
        const lines = new THREE.LineSegments(edgesGeo, lineMat);
        containerGroup.add(lines);

        // 2. Solid triangles (at vertices)
        const triGeo = createContainerSolidTrianglesGeometry(cWidth, cHeight, cDepth);
        const triMat = new THREE.MeshBasicMaterial({ color: 0xb0bec5, side: THREE.DoubleSide });
        const solidTriangles = new THREE.Mesh(triGeo, triMat);
        containerGroup.add(solidTriangles);

        scene.add(containerGroup);
        Registry.addStructure(containerGroup);
        currentTheatreMeshes.push(containerGroup);

        // Only render container dimension lines if no catalog theater is active (to avoid overlap)
        if (activeTheaterId === 'ninguno') {
            const halfW = cWidth / 2;
            const halfD = cDepth / 2;

            const floorContour = [
                new THREE.Vector3(-halfW, 0, halfD),
                new THREE.Vector3(halfW, 0, halfD),
                new THREE.Vector3(halfW, 0, -halfD),
                new THREE.Vector3(-halfW, 0, -halfD),
            ];

            const backWallContour = [
                new THREE.Vector3(-halfW, 0, -halfD),
                new THREE.Vector3(halfW, 0, -halfD),
                new THREE.Vector3(halfW, cHeight, -halfD),
                new THREE.Vector3(-halfW, cHeight, -halfD),
            ];

            const dimX = new CADDimension(
                scene,
                new THREE.Vector3(-halfW, 0, halfD),
                new THREE.Vector3(halfW, 0, halfD),
                `${cWidth.toFixed(2)} m`,
                new THREE.Vector3(0, 0, 1), 1.0, 0x858585, floorContour
            );
            dimX.group.userData.views = ['3d', 'ortho', 'top', 'bottom'];
            dims.push(dimX);

            const dimX_front = new CADDimension(
                scene,
                new THREE.Vector3(-halfW, 0, halfD),
                new THREE.Vector3(halfW, 0, halfD),
                `${cWidth.toFixed(2)} m`,
                new THREE.Vector3(0, -1, 0), 1.0, 0x858585, null
            );
            dimX_front.group.userData.views = ['front'];
            dims.push(dimX_front);

            const dimZ_main = new CADDimension(
                scene,
                new THREE.Vector3(halfW, 0, halfD),
                new THREE.Vector3(halfW, 0, -halfD),
                `${cDepth.toFixed(2)} m`,
                new THREE.Vector3(1, 0, 0), 1.0, 0x858585, floorContour
            );
            dimZ_main.group.userData.views = ['3d', 'ortho', 'top', 'bottom'];
            dims.push(dimZ_main);

            const dimY_main = new CADDimension(
                scene,
                new THREE.Vector3(halfW, 0, -halfD),
                new THREE.Vector3(halfW, cHeight, -halfD),
                `${cHeight.toFixed(2)} m`,
                new THREE.Vector3(1, 0, 0), 1.0, 0x858585, backWallContour
            );
            dimY_main.group.userData.views = ['3d', 'ortho', 'front'];
            dims.push(dimY_main);
        }
    }

    // 2. RENDER THEATER SOLID STRUCTURE (If activeTheaterId !== 'ninguno')
    if (activeTheaterId !== 'ninguno') {
        const buildMat = new THREE.MeshStandardMaterial({ color: 0x2a333d, transparent: true });
        const barMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true });

        // Walls
        meshes.push(createStruct(
            new THREE.BoxGeometry(width, height, wallThickness),
            buildMat, '#00ffff', 'pared-fondo', 'paredes',
            0, height / 2, -depth / 2 - wallThickness / 2, 0,
            'box', { w: width, h: height, d: wallThickness }
        ));

        meshes.push(createStruct(
            new THREE.BoxGeometry(wallThickness, height, depth),
            buildMat, '#00ffff', 'pared-izq', 'paredes',
            -width / 2 - wallThickness / 2, height / 2, 0, 0,
            'box', { w: wallThickness, h: height, d: depth }
        ));

        meshes.push(createStruct(
            new THREE.BoxGeometry(wallThickness, height, depth),
            buildMat, '#00ffff', 'pared-der', 'paredes',
            width / 2 + wallThickness / 2, height / 2, 0, 0,
            'box', { w: wallThickness, h: height, d: depth }
        ));

        // Floor
        meshes.push(createStruct(
            new THREE.BoxGeometry(width, wallThickness, depth),
            buildMat, '#00ff00', 'piso', null,
            0, -wallThickness / 2, 0, 0,
            'box', { w: width, h: wallThickness, d: depth }
        ));

        // Lighting bars
        const barGeo = new THREE.CylinderGeometry(barRadius, barRadius, width, 16);
        for (let i = 1; i <= barCount; i++) {
            meshes.push(createStruct(
                barGeo, barMat, '#ff00ff', `barra-${i}`, 'barras',
                0, height, depth / 2 - i * (depth / (barCount + 1)),
                Math.PI / 2, 'cylinder', { r: barRadius, h: width }
            ));
        }

        // CAD Dimensions (for theater)
        const halfW = width / 2;
        const halfD = depth / 2;

        const floorContour = [
            new THREE.Vector3(-halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, -halfD),
            new THREE.Vector3(-halfW, 0, -halfD),
        ];

        const backWallContour = [
            new THREE.Vector3(-halfW, 0, -halfD),
            new THREE.Vector3(halfW, 0, -halfD),
            new THREE.Vector3(halfW, height, -halfD),
            new THREE.Vector3(-halfW, height, -halfD),
        ];

        const dimX = new CADDimension(
            scene,
            new THREE.Vector3(-halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, halfD),
            `${width.toFixed(2)} m`,
            new THREE.Vector3(0, 0, 1), 1.0, 0x858585, floorContour
        );
        dimX.group.userData.views = ['3d', 'ortho', 'top', 'bottom'];
        dims.push(dimX);

        const dimX_front = new CADDimension(
            scene,
            new THREE.Vector3(-halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, halfD),
            `${width.toFixed(2)} m`,
            new THREE.Vector3(0, -1, 0), 1.0, 0x858585, null
        );
        dimX_front.group.userData.views = ['front'];
        dims.push(dimX_front);

        const dimZ_main = new CADDimension(
            scene,
            new THREE.Vector3(halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, -halfD),
            `${depth.toFixed(2)} m`,
            new THREE.Vector3(1, 0, 0), 1.0, 0x858585, floorContour
        );
        dimZ_main.group.userData.views = ['3d', 'ortho', 'top', 'bottom'];
        dims.push(dimZ_main);

        const dimY_main = new CADDimension(
            scene,
            new THREE.Vector3(halfW, 0, -halfD),
            new THREE.Vector3(halfW, height, -halfD),
            `${height.toFixed(2)} m`,
            new THREE.Vector3(1, 0, 0), 1.0, 0x858585, backWallContour
        );
        dimY_main.group.userData.views = ['3d', 'ortho', 'front'];
        dims.push(dimY_main);

        const dimZ_lat = new CADDimension(
            scene,
            new THREE.Vector3(halfW, 0, halfD),
            new THREE.Vector3(halfW, 0, -halfD),
            `${depth.toFixed(2)} m`,
            new THREE.Vector3(0, -1, 0), 1.0, 0x858585, null
        );
        dimZ_lat.group.userData.views = ['left', 'right'];
        dims.push(dimZ_lat);

        const dimY_lat = new CADDimension(
            scene,
            new THREE.Vector3(halfW, 0, -halfD),
            new THREE.Vector3(halfW, height, -halfD),
            `${height.toFixed(2)} m`,
            new THREE.Vector3(0, 0, -1), 1.0, 0x858585, null
        );
        dimY_lat.group.userData.views = ['left', 'right'];
        dims.push(dimY_lat);
    }

    dims.forEach(d => Registry.addDimension(d));

    // Consolidate meshes created in createStruct calls
    meshes.forEach(m => currentTheatreMeshes.push(m));
    currentTheatreDims = dims;

    return { meshes, dimensions: dims };
}

/**
 * Rebuilds the theatre using new dimensions and reapplies layer visibility
 */
export function rebuildTheatre(config = {}) {
    buildTheatre(config);
    
    // Notify scene to re-apply any wireframe/visibility state for the new elements
    const is3D = State.get('is3DMode');
    const isWire = State.get('isWireframe');
    applyLayerVisibility(is3D, isWire);
}

/**
 * Creates custom box lines geometry (edges, center floor crosshair, and floor corners).
 */
function createContainerNormalGeometry(width, height, depth) {
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

    // 2. Add crosshair on the floor
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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
}

/**
 * Creates custom solid triangle geometry for the scenic container's corners.
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
