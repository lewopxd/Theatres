// ============================================================
// SidebarController — Tree events, visibility/lock/color
// Adapted for new mockup CAD tree design with Phosphor Icons
// ============================================================

import { EventBus } from '../core/EventBus.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { History } from '../core/History.js';
import { applyLayerVisibility, updateBrightness } from '../engine/SceneManager.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { createIcons, $ } from '../utils/dom.js';

/**
 * Initialize sidebar: toggle, tree click/dblclick, visibility/lock/color
 */
export function initSidebar() {
    const sidebarEl = $('sidebar');

    // Z-index on click
    sidebarEl.addEventListener('mousedown', () => { sidebarEl.style.zIndex = State.bumpZ(); });
    $('properties-panel').addEventListener('mousedown', () => { $('properties-panel').style.zIndex = State.bumpZ(); });

    // Explorer toggle
    const toggleExplorer = function () {
        const willOpen = !sidebarEl.classList.contains('open');
        sidebarEl.classList.toggle('open');
        
        const topBtn = $('btn-top-explorer');
        if (topBtn) topBtn.classList.toggle('active', willOpen);
        
        const railBtn = $('nav-explorer');
        if (railBtn) railBtn.classList.toggle('active', willOpen);
        
        if (willOpen) EventBus.emit('ui:closeOthers', 'sidebar');
    };
    
    // Exponer para el HTML
    window._toggleExplorer = toggleExplorer;

    EventBus.on('ui:closeOthers', (source) => {
        if (source !== 'sidebar') {
            sidebarEl.classList.remove('open');
            const topBtn = $('btn-top-explorer');
            const railBtn = $('nav-explorer');
            if (topBtn) topBtn.classList.remove('active');
            if (railBtn) railBtn.classList.remove('active');
        }
    });

    // Tree click (select) — works on .tree-node elements
    const treeContainer = $('tree-container');
    if (treeContainer) {
        treeContainer.addEventListener('click', e => {
            // Don't interfere with controls or chevrons
            if (e.target.closest('.tree-node-controls')) return;
            if (e.target.closest('.chevron')) return;

            const nodeRow = e.target.closest('.tree-node');
            if (!nodeRow) {
                EventBus.emit('selection:clear');
                return;
            }

            // Highlight selected
            document.querySelectorAll('.tree-node.selected').forEach(n => n.classList.remove('selected'));
            nodeRow.classList.add('selected');

            let mesh = null;
            if (nodeRow.dataset.type === 'elemento' && nodeRow.dataset.id) {
                mesh = Registry.findStructureById(nodeRow.dataset.id);
            }
            EventBus.emit('selection:select', { mesh, li: nodeRow, showProps: false });
        });

        // Tree dblclick (select + show props)
        treeContainer.addEventListener('dblclick', e => {
            if (e.target.closest('.tree-node-controls')) return;
            const nodeRow = e.target.closest('.tree-node');
            if (!nodeRow) return;

            let mesh = null;
            if (nodeRow.dataset.type === 'elemento' && nodeRow.dataset.id) {
                mesh = Registry.findStructureById(nodeRow.dataset.id);
            }
            EventBus.emit('selection:select', { mesh, li: nodeRow, showProps: true });
        });
    }

    // Visibility toggle
    sidebarEl.addEventListener('click', e => {
        const btn = e.target.closest('.visibility-btn');
        const lockBtn = e.target.closest('.lock-btn');

        if (btn) {
            e.stopPropagation();
            const targetId = btn.dataset.target;
            if (!targetId) return;
            const isGroup = btn.dataset.isGroup === 'true';
            const isHidden = btn.classList.contains('hidden-layer');
            const newState = isHidden; // if hidden, newState = true (make visible)

            btn.classList.toggle('hidden-layer', !newState);

            // Update icon: eye vs eye-slash
            if (newState) {
                btn.classList.remove('ph-eye-slash');
                btn.classList.add('ph-eye');
            } else {
                btn.classList.remove('ph-eye');
                btn.classList.add('ph-eye-slash');
            }

            Registry.getStructures().forEach(s => {
                if ((isGroup && s.userData.group === targetId) || s.userData.id === targetId)
                    s.userData.layerVisible = newState;
            });
            Registry.getWires().forEach(w => {
                if ((isGroup && w.userData.group === targetId) || w.userData.id === targetId)
                    w.userData.layerVisible = newState;
            });

            if (isGroup) {
                document.querySelectorAll(`.visibility-btn[data-parent="${targetId}"]`).forEach(childBtn => {
                    childBtn.classList.toggle('hidden-layer', !newState);
                    if (newState) {
                        childBtn.classList.remove('ph-eye-slash');
                        childBtn.classList.add('ph-eye');
                    } else {
                        childBtn.classList.remove('ph-eye');
                        childBtn.classList.add('ph-eye-slash');
                    }
                });
            }

            applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));
            History.save();
        }

        if (lockBtn) {
            e.stopPropagation();
            const targetId = lockBtn.dataset.target;
            if (!targetId) return;
            const isGroup = lockBtn.dataset.isGroup === 'true';
            const isLocked = lockBtn.classList.contains('is-locked');
            const newState = !isLocked;

            lockBtn.classList.toggle('is-locked', newState);

            // Update icon: lock-key vs lock-key-open
            if (newState) {
                lockBtn.classList.remove('ph-lock-key-open');
                lockBtn.classList.add('ph-lock-key');
            } else {
                lockBtn.classList.remove('ph-lock-key');
                lockBtn.classList.add('ph-lock-key-open');
            }

            Registry.getStructures().forEach(s => {
                if ((isGroup && s.userData.group === targetId) || s.userData.id === targetId)
                    s.userData.locked = newState;
            });

            if (isGroup) {
                document.querySelectorAll(`.lock-btn[data-parent="${targetId}"]`).forEach(childBtn => {
                    childBtn.classList.toggle('is-locked', newState);
                    if (newState) {
                        childBtn.classList.remove('ph-lock-key-open');
                        childBtn.classList.add('ph-lock-key');
                    } else {
                        childBtn.classList.remove('ph-lock-key');
                        childBtn.classList.add('ph-lock-key-open');
                    }
                });
            }

            const selectedMesh = State.get('selectedMesh');
            if (selectedMesh && (selectedMesh.userData.id === targetId || selectedMesh.userData.group === targetId)) {
                EventBus.emit('properties:refresh');
            }
            History.save();
        }
    });

    // Color picker real-time update (for legacy .layer-picker inputs if any remain)
    const handleColorUpdate = (e) => {
        if (!e.target.classList.contains('layer-picker')) return;
        const { target, isGroup } = e.target.dataset;
        const val = e.target.value;

        Registry.getWires().forEach(w => {
            if ((isGroup === 'true' && w.userData.group === target) || w.userData.id === target)
                w.userData.baseColor.set(val);
        });

        if (isGroup === 'true') {
            document.querySelectorAll(`.layer-picker[data-parent="${target}"]`).forEach(c => c.value = val);
        }

        const selectedMesh = State.get('selectedMesh');
        syncSelectionEdges(selectedMesh);
        if (selectedMesh && (selectedMesh.userData.id === target || selectedMesh.userData.group === target)) {
            EventBus.emit('properties:refresh');
        }

        const slider = $('brightness-slider');
        updateBrightness(slider ? parseFloat(slider.value) : 1);
    };

    sidebarEl.addEventListener('input', handleColorUpdate);
    
    sidebarEl.addEventListener('change', e => {
        if (!e.target.classList.contains('layer-picker')) return;
        handleColorUpdate(e);
        History.save();
    });
}
