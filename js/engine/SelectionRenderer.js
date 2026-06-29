// ============================================================
// SelectionRenderer — Edges de selección (highlight wireframe)
// ============================================================

import { State } from '../core/State.js';
import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { Registry } from '../core/Registry.js';
import { MoveHandle } from './MoveHandle.js';

// Create selection edges mesh
const selectionGroup = new THREE.Group();
selectionGroup.name = '__selectionGroup__';
selectionGroup.renderOrder = 100;
scene.add(selectionGroup);

const selectionEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineDashedMaterial({ // Changed to dashed material to support both solid and dashed
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

// Create 20 dots for the 2D bounding box (8 corners + 12 midpoints)
const cornerDots = [];
const dotGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08); // small cube instead of sphere for "editor" feel
const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
for (let i = 0; i < 20; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.visible = false;
    selectionGroup.add(dot);
    cornerDots.push(dot);
}

/**
 * Sync selection edges to match the given mesh
 * @param {THREE.Mesh|null} mesh
 */
export function syncSelectionEdges(mesh) {
    if (!mesh) {
        selectionEdges.visible = false;
        cornerDots.forEach(d => d.visible = false);
        return;
    }

    selectionEdges.visible = true;
    selectionEdges.geometry.dispose();
    
    const is3DMode = State.get('is3DMode');
    
    if (is3DMode) {
        selectionEdges.geometry = new THREE.EdgesGeometry(mesh.geometry);
        const wire = Registry.findWireById(mesh.userData.id);
        const color = wire ? wire.userData.baseColor : new THREE.Color(0xffffff);
        selectionEdges.material.color.copy(color);
        selectionEdges.material.opacity = 1.0;
        selectionEdges.material.dashSize = 1000; // make it effectively solid
        selectionEdges.material.gapSize = 0;
        cornerDots.forEach(d => d.visible = false);
    } else {
        // 2D Mode: Draw a bounding box around the object
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        
        // Add no margin to encapsulate the object exactly
        const margin = 0.0;
        const w = box.max.x - box.min.x + margin;
        const h = box.max.y - box.min.y + margin;
        const d = box.max.z - box.min.z + margin;
        
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        selectionEdges.geometry = new THREE.EdgesGeometry(boxGeo);
        boxGeo.dispose(); // Prevent memory leak since EdgesGeometry makes its own copy
        
        const center = new THREE.Vector3();
        box.getCenter(center);
        selectionEdges.geometry.translate(center.x, center.y, center.z);
        
        selectionEdges.geometry.computeLineDistances(); // required for dashed lines
        
        selectionEdges.material.color.setHex(0xffffff);
        selectionEdges.material.opacity = 0.5; // Slightly transparent white
        selectionEdges.material.dashSize = 0.2;
        selectionEdges.material.gapSize = 0.15;
        
        // Update 20 dots (8 corners + 12 midpoints)
        const hw = w / 2;
        const hh = h / 2;
        const hd = d / 2;
        const cx = center.x, cy = center.y, cz = center.z;
        
        const pts = [
            // 8 corners
            new THREE.Vector3(cx - hw, cy - hh, cz - hd),
            new THREE.Vector3(cx + hw, cy - hh, cz - hd),
            new THREE.Vector3(cx - hw, cy + hh, cz - hd),
            new THREE.Vector3(cx + hw, cy + hh, cz - hd),
            new THREE.Vector3(cx - hw, cy - hh, cz + hd),
            new THREE.Vector3(cx + hw, cy - hh, cz + hd),
            new THREE.Vector3(cx - hw, cy + hh, cz + hd),
            new THREE.Vector3(cx + hw, cy + hh, cz + hd),
            
            // 12 midpoints
            new THREE.Vector3(cx, cy - hh, cz - hd), // bottom front mid
            new THREE.Vector3(cx, cy + hh, cz - hd), // top front mid
            new THREE.Vector3(cx, cy - hh, cz + hd), // bottom back mid
            new THREE.Vector3(cx, cy + hh, cz + hd), // top back mid
            
            new THREE.Vector3(cx - hw, cy, cz - hd), // left front mid
            new THREE.Vector3(cx + hw, cy, cz - hd), // right front mid
            new THREE.Vector3(cx - hw, cy, cz + hd), // left back mid
            new THREE.Vector3(cx + hw, cy, cz + hd), // right back mid
            
            new THREE.Vector3(cx - hw, cy - hh, cz), // left bottom mid
            new THREE.Vector3(cx + hw, cy - hh, cz), // right bottom mid
            new THREE.Vector3(cx - hw, cy + hh, cz), // left top mid
            new THREE.Vector3(cx + hw, cy + hh, cz)  // right top mid
        ];
        
        for (let i = 0; i < 20; i++) {
            cornerDots[i].position.copy(pts[i]);
            cornerDots[i].visible = true;
        }
    }
    
    selectionGroup.position.copy(mesh.position);
    selectionGroup.rotation.copy(mesh.rotation);
    selectionGroup.scale.copy(mesh.scale);

    // Keep move handle synced
    MoveHandle.update(mesh);
}
