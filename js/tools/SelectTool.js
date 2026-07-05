// ============================================================
// SelectTool — Lógica de selección por clic y doble-clic
// ============================================================

import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { Registry } from '../core/Registry.js';
import { setRaycasterFromEvent, getIntersected, getRaycaster, mapIntersectsToStructures } from '../engine/RaycasterManager.js';
import { DBL_CLICK_MS, DRAG_THRESHOLD } from '../utils/constants.js';
import { isOverUI } from '../utils/dom.js';

let lastClickTime = 0;
let lastClickTarget = null;

/**
 * Handle click (pointerup) for selection
 * @param {PointerEvent} e
 * @param {{ x: number, y: number }} pointerDownPos
 */
export function handleSelectClick(e, pointerDownPos) {
    if (isOverUI(e)) return;

    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist >= DRAG_THRESHOLD) return;
    if (e.button !== 0) return;

    const tool = State.get('activeTool');

    const now = Date.now();
    setRaycasterFromEvent(e);
    
    // Temporarily make valid structures visible for raycasting so we can click inside 2D shapes
    const structures = Registry.getStructures();
    const visibilityCache = new Map();
    
    structures.forEach(m => {
        visibilityCache.set(m, m.visible);
        if (m.userData.layerVisible) {
            m.visible = true;
        }
    });
    
    const raycaster = getRaycaster();
    let intersects = raycaster.intersectObjects(structures, true);
    intersects = mapIntersectsToStructures(intersects, structures);
    
    // Restore visibility
    structures.forEach(m => {
        m.visible = visibilityCache.get(m);
    });
    
    let hitMesh = null;
    for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (!obj.userData || !obj.userData.locked) {
            hitMesh = obj;
            break;
        }
    }

    const isDoubleClick = (now - lastClickTime < DBL_CLICK_MS) && (lastClickTarget === hitMesh);
    lastClickTime = now;
    lastClickTarget = hitMesh;

    if (hitMesh && hitMesh.userData && !hitMesh.userData.locked) {
        // Always select an unlocked object, even if in orbit/pan mode (Photoshop-like auto-select)
        const li = document.querySelector(`.tree-node[data-id="${hitMesh.userData.id}"]`);
        EventBus.emit('selection:select', {
            mesh: hitMesh,
            li,
            showProps: isDoubleClick
        });
    } else {
        // Always clear selection when clicking on empty space or a locked object (like the floor)
        EventBus.emit('selection:clear');
    }
}
