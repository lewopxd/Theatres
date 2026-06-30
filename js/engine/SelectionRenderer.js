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
export function syncSelectionEdges(mesh) {
    if (!mesh) {
        selectionEdges.visible = false;
        cornerDots.forEach(d => d.visible = false);
        MoveHandle.hide();
        return;
    }

    selectionEdges.visible = true;
    selectionEdges.geometry.dispose();
    
    const is3DMode = State.get('is3DMode');
    
    if (is3DMode) {
        // 3D Mode: wireframe edges matching the object's geometry
        selectionEdges.geometry = new THREE.EdgesGeometry(mesh.geometry);
        const wire = Registry.findWireById(mesh.userData.id);
        const color = wire ? wire.userData.baseColor : new THREE.Color(0xffffff);
        selectionEdges.material.color.copy(color);
        selectionEdges.material.opacity = 1.0;
        selectionEdges.material.dashSize = 1000; // effectively solid
        selectionEdges.material.gapSize = 0;
        cornerDots.forEach(d => d.visible = false);
    } else {
        // 2D Mode: Dashed bounding box with corner/midpoint dots
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        
        const w = box.max.x - box.min.x;
        const h = box.max.y - box.min.y;
        const d = box.max.z - box.min.z;
        
        // Create a box geometry centered at origin — NO translate needed
        // because selectionGroup.position already matches mesh.position
        const boxGeo = new THREE.BoxGeometry(w, h, d);
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
        
        const pts = [
            // 8 corners
            new THREE.Vector3(-hw, -hh, -hd),
            new THREE.Vector3( hw, -hh, -hd),
            new THREE.Vector3(-hw,  hh, -hd),
            new THREE.Vector3( hw,  hh, -hd),
            new THREE.Vector3(-hw, -hh,  hd),
            new THREE.Vector3( hw, -hh,  hd),
            new THREE.Vector3(-hw,  hh,  hd),
            new THREE.Vector3( hw,  hh,  hd),
            
            // 12 midpoints of edges
            new THREE.Vector3(  0, -hh, -hd),
            new THREE.Vector3(  0,  hh, -hd),
            new THREE.Vector3(  0, -hh,  hd),
            new THREE.Vector3(  0,  hh,  hd),
            
            new THREE.Vector3(-hw,   0, -hd),
            new THREE.Vector3( hw,   0, -hd),
            new THREE.Vector3(-hw,   0,  hd),
            new THREE.Vector3( hw,   0,  hd),
            
            new THREE.Vector3(-hw, -hh,   0),
            new THREE.Vector3( hw, -hh,   0),
            new THREE.Vector3(-hw,  hh,   0),
            new THREE.Vector3( hw,  hh,   0)
        ];
        
        for (let i = 0; i < 20; i++) {
            cornerDots[i].position.copy(pts[i]);
            cornerDots[i].visible = true;
        }
    }
    
    // Position the group at the mesh's world transform
    selectionGroup.position.copy(mesh.position);
    selectionGroup.rotation.copy(mesh.rotation);
    selectionGroup.scale.copy(mesh.scale);

    // Keep move handle synced
    MoveHandle.update(mesh);
}

/**
 * Update the position of the selection edges and move handle without full resync
 * Useful when dragging the ghost instead of the real mesh.
 * @param {THREE.Vector3} pos
 */
export function updateSelectionPosition(pos) {
    selectionGroup.position.copy(pos);
    MoveHandle.setPosition(pos);
}
