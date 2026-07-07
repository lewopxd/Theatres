// ============================================================
// StatusBar — Barra inferior: coordenadas + cámara
// ============================================================

import * as THREE from 'three';
import { EventBus } from '../core/EventBus.js';
import { Settings } from '../core/Settings.js';

/**
 * Initialize status bar listeners
 */
export function initStatusBar() {
    EventBus.on('statusbar:coords', ({ mesh }) => {
        const elPos = document.querySelector('#status-coords span');
        const elRot = document.querySelector('#status-rotation span');
        if (mesh) {
            if (Settings.get('visualZUp')) {
                elPos.textContent = `X: ${mesh.position.x.toFixed(2)}m  Y: ${mesh.position.z.toFixed(2)}m  Z: ${mesh.position.y.toFixed(2)}m`;
            } else {
                elPos.textContent = `X: ${mesh.position.x.toFixed(2)}m  Y: ${mesh.position.y.toFixed(2)}m  Z: ${mesh.position.z.toFixed(2)}m`;
            }
            
            // Convert to degrees for rotation display
            if (mesh.quaternion) {
                const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
                const rx = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
                const ry = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
                const rz = THREE.MathUtils.radToDeg(euler.z).toFixed(1);
                
                if (Settings.get('visualZUp')) {
                    elRot.textContent = `${rx}° / ${rz}° / ${ry}°`;
                } else {
                    elRot.textContent = `${rx}° / ${ry}° / ${rz}°`;
                }
            } else if (mesh.rotation) {
                const rx = THREE.MathUtils.radToDeg(mesh.rotation.x || 0).toFixed(1);
                const ry = THREE.MathUtils.radToDeg(mesh.rotation.y || 0).toFixed(1);
                const rz = THREE.MathUtils.radToDeg(mesh.rotation.z || 0).toFixed(1);
                
                if (Settings.get('visualZUp')) {
                    elRot.textContent = `${rx}° / ${rz}° / ${ry}°`;
                } else {
                    elRot.textContent = `${rx}° / ${ry}° / ${rz}°`;
                }
            } else {
                elRot.textContent = `0.0° / 0.0° / 0.0°`;
            }
            
        } else {
            elPos.textContent = `8m (W) × 4.5m (H) × 7.5m (D)`;
            elRot.textContent = `- / - / -`;
        }
    });
}
