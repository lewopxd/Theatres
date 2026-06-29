// ============================================================
// GridGenerator — Generación de grid configurable
// ============================================================

import * as THREE from 'three';
import { scene } from './SceneManager.js';

let currentGrid = null;

/**
 * Generate (or regenerate) the grid based on config
 * @param {Object} config — { visible, type, color, size, opacity, belowFloor }
 * @param {number} wallThickness — thickness of the floor slab
 */
export function generateGrid(config, wallThickness = 0.2) {
    // Remove previous grid
    if (currentGrid) {
        scene.remove(currentGrid);
        currentGrid.geometry?.dispose();
        if (Array.isArray(currentGrid.material)) {
            currentGrid.material.forEach(m => m.dispose());
        } else {
            currentGrid.material?.dispose();
        }
        currentGrid = null;
    }

    if (!config.visible) return null;

    const extent = 15, spacing = 0.5;
    let mesh;

    if (config.type === 'dots') {
        const pos = [];
        for (let i = -extent; i <= extent; i += spacing) {
            for (let j = -extent; j <= extent; j += spacing) {
                pos.push(i, 0, j);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color: config.color,
            size: config.size,
            transparent: true,
            opacity: config.opacity,
            sizeAttenuation: false
        });
        mesh = new THREE.Points(geo, mat);
    } else if (config.type === 'lines') {
        mesh = new THREE.GridHelper(extent * 2, (extent * 2) / spacing, config.color, config.color);
        mesh.material.transparent = true;
        mesh.material.opacity = config.opacity;
    } else if (config.type === 'dashed') {
        const pos = [];
        for (let i = -extent; i <= extent; i += spacing) {
            pos.push(-extent, 0, i, extent, 0, i);
            pos.push(i, 0, -extent, i, 0, extent);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.LineDashedMaterial({
            color: config.color,
            transparent: true,
            opacity: config.opacity,
            dashSize: 0.2,
            gapSize: 0.2
        });
        mesh = new THREE.LineSegments(geo, mat);
        mesh.computeLineDistances();
    } else if (config.type === 'crosses') {
        const d = config.size * 0.05;
        const pos = [];
        for (let i = -extent; i <= extent; i += spacing) {
            for (let j = -extent; j <= extent; j += spacing) {
                pos.push(i - d, 0, j, i + d, 0, j);
                pos.push(i, 0, j - d, i, 0, j + d);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
            color: config.color,
            transparent: true,
            opacity: config.opacity
        }));
    }

    if (mesh) {
        mesh.name = '__grid__';
        mesh.position.y = config.belowFloor ? -wallThickness - 0.01 : 0.01;
        scene.add(mesh);
        currentGrid = mesh;
    }

    return mesh;
}
