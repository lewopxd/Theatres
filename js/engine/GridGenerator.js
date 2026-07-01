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

    const baseExtent = 15;
    const spacing = parseFloat(config.size) || 1.0;
    const numLinesPerSide = Math.ceil(baseExtent / spacing);
    const extent = numLinesPerSide * spacing;
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
            size: 2, // Hardcoded dot pixel size
            transparent: true,
            opacity: config.opacity,
            sizeAttenuation: false
        });
        mesh = new THREE.Points(geo, mat);
    } else if (config.type === 'lines') {
        // GridHelper(size, divisions, colorCenterLine, colorGrid)
        const divisions = numLinesPerSide * 2;
        mesh = new THREE.GridHelper(extent * 2, divisions, config.color, config.color);
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
        const d = spacing * 0.1;
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
        if (config.showCenter) {
            let pos = [];
            
            // 1. Generate geometry positions based on centerShape
            if (config.centerShape === 'full') {
                pos = [
                    -extent, 0, 0,  extent, 0, 0,
                    0, 0, -extent,  0, 0, extent
                ];
            } else if (config.centerShape === 'cross') {
                const len = spacing * 0.5;
                pos = [
                    -len, 0, 0,  len, 0, 0,
                    0, 0, -len,  0, 0, len
                ];
            } else if (config.centerShape === 'corners') {
                const s = spacing * 0.5;
                const l = spacing * 0.2;
                pos = [
                    -s, 0, -s, -s+l, 0, -s,   -s, 0, -s, -s, 0, -s+l, // Top-Left
                    s, 0, -s, s-l, 0, -s,     s, 0, -s, s, 0, -s+l,   // Top-Right
                    -s, 0, s, -s+l, 0, s,     -s, 0, s, -s, 0, s-l,   // Bottom-Left
                    s, 0, s, s-l, 0, s,       s, 0, s, s, 0, s-l      // Bottom-Right
                ];
            } else if (config.centerShape === 'dot') {
                pos = [0, 0, 0];
            }

            // 2. Generate Material and Mesh based on centerStyle
            let axesGeo = new THREE.BufferGeometry();
            let axesMesh;
            
            if (config.centerShape === 'dot') {
                axesGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                const mat = new THREE.PointsMaterial({ color: config.centerColor, size: 4, sizeAttenuation: false, transparent: true, opacity: config.centerOpacity });
                axesMesh = new THREE.Points(axesGeo, mat);
            } else if (config.centerStyle === 'dots') {
                // Generate dense points along the line segments
                const dotPos = [];
                for (let i = 0; i < pos.length; i += 6) {
                    const x1 = pos[i], z1 = pos[i+2];
                    const x2 = pos[i+3], z2 = pos[i+5];
                    const dist = Math.hypot(x2 - x1, z2 - z1);
                    const numDots = Math.max(2, Math.floor(dist / (spacing * 0.2)));
                    for (let j = 0; j <= numDots; j++) {
                        const t = j / numDots;
                        dotPos.push(x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t);
                    }
                }
                axesGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
                const mat = new THREE.PointsMaterial({ color: config.centerColor, size: 3, sizeAttenuation: false, transparent: true, opacity: config.centerOpacity });
                axesMesh = new THREE.Points(axesGeo, mat);
            } else {
                axesGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                if (config.centerStyle === 'dashed') {
                    const mat = new THREE.LineDashedMaterial({ color: config.centerColor, dashSize: 0.2, gapSize: 0.2, transparent: true, opacity: config.centerOpacity });
                    axesMesh = new THREE.LineSegments(axesGeo, mat);
                    axesMesh.computeLineDistances();
                } else {
                    const mat = new THREE.LineBasicMaterial({ color: config.centerColor, transparent: true, opacity: config.centerOpacity });
                    axesMesh = new THREE.LineSegments(axesGeo, mat);
                }
            }

            mesh.add(axesMesh);
        }

        mesh.name = '__grid__';
        mesh.position.y = config.belowFloor ? -wallThickness - 0.01 : 0.01;
        scene.add(mesh);
        currentGrid = mesh;
    }

    return mesh;
}
