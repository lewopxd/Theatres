// ============================================================
// TheatreFactory — Crea geometrías de un teatro a partir de medidas
// ============================================================

import * as THREE from 'three';
import { scene } from '../engine/SceneManager.js';
import { Registry } from '../core/Registry.js';
import { createStruct } from './StructureBuilder.js';
import { CADDimension } from './CADDimensions.js';
import { DEFAULT_STAGE } from '../utils/constants.js';

/**
 * Build a theatre from dimensions
 * @param {Object} [config] — overrides for DEFAULT_STAGE
 * @returns {{ structures: THREE.Mesh[], dimensions: CADDimension[] }}
 */
export function buildTheatre(config = {}) {
    const {
        width = DEFAULT_STAGE.width,
        height = DEFAULT_STAGE.height,
        depth = DEFAULT_STAGE.depth,
        wallThickness = DEFAULT_STAGE.wallThickness,
        barCount = DEFAULT_STAGE.barCount,
        barRadius = DEFAULT_STAGE.barRadius,
    } = config;

    const buildMat = new THREE.MeshStandardMaterial({ color: 0x2a333d, transparent: true });
    const barMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true });

    const meshes = [];

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

    // CAD Dimensions
    const dims = [];
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

    // Width dimension specifically for front view (offset downwards)
    const dimX_front = new CADDimension(
        scene,
        new THREE.Vector3(-halfW, 0, halfD),
        new THREE.Vector3(halfW, 0, halfD),
        `${width.toFixed(2)} m`,
        new THREE.Vector3(0, -1, 0), 1.0, 0x858585, null
    );
    dimX_front.group.userData.views = ['front'];
    dims.push(dimX_front);

    // Depth dimension for 3D and Top
    const dimZ_main = new CADDimension(
        scene,
        new THREE.Vector3(halfW, 0, halfD),
        new THREE.Vector3(halfW, 0, -halfD),
        `${depth.toFixed(2)} m`,
        new THREE.Vector3(1, 0, 0), 1.0, 0x858585, floorContour
    );
    dimZ_main.group.userData.views = ['3d', 'ortho', 'top', 'bottom'];
    dims.push(dimZ_main);

    // Height dimension for 3D
    const dimY_main = new CADDimension(
        scene,
        new THREE.Vector3(halfW, 0, -halfD),
        new THREE.Vector3(halfW, height, -halfD),
        `${height.toFixed(2)} m`,
        new THREE.Vector3(1, 0, 0), 1.0, 0x858585, backWallContour
    );
    dimY_main.group.userData.views = ['3d', 'ortho', 'front'];
    dims.push(dimY_main);

    // Depth dimension specifically for lateral views (offset downwards)
    const dimZ_lat = new CADDimension(
        scene,
        new THREE.Vector3(halfW, 0, halfD),
        new THREE.Vector3(halfW, 0, -halfD),
        `${depth.toFixed(2)} m`,
        new THREE.Vector3(0, -1, 0), 1.0, 0x858585, null
    );
    dimZ_lat.group.userData.views = ['left', 'right'];
    dims.push(dimZ_lat);

    // Height dimension specifically for lateral views (offset backwards)
    const dimY_lat = new CADDimension(
        scene,
        new THREE.Vector3(halfW, 0, -halfD),
        new THREE.Vector3(halfW, height, -halfD),
        `${height.toFixed(2)} m`,
        new THREE.Vector3(0, 0, -1), 1.0, 0x858585, null
    );
    dimY_lat.group.userData.views = ['left', 'right'];
    dims.push(dimY_lat);

    // Register dimensions
    dims.forEach(d => Registry.addDimension(d));

    return { meshes, dimensions: dims };
}
