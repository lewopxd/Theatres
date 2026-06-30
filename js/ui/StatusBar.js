// ============================================================
// StatusBar — Barra inferior: coordenadas + cámara
// ============================================================

import { EventBus } from '../core/EventBus.js';
import { Settings } from '../core/Settings.js';

/**
 * Initialize status bar listeners
 */
export function initStatusBar() {
    EventBus.on('statusbar:coords', ({ mesh }) => {
        const el = document.querySelector('#status-coords span');
        if (mesh) {
            if (Settings.get('visualZUp')) {
                el.textContent = `X: ${mesh.position.x.toFixed(2)}m  Y: ${mesh.position.z.toFixed(2)}m  Z: ${mesh.position.y.toFixed(2)}m`;
            } else {
                el.textContent = `X: ${mesh.position.x.toFixed(2)}m  Y: ${mesh.position.y.toFixed(2)}m  Z: ${mesh.position.z.toFixed(2)}m`;
            }
        } else {
            el.textContent = `8m (W) × 4.5m (H) × 7.5m (D)`;
        }
    });
}
