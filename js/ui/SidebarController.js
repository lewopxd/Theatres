// ============================================================
// SidebarController — Tabs, tree events, visibility/lock/color
// ============================================================

import { EventBus } from '../core/EventBus.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { History } from '../core/History.js';
import { applyLayerVisibility, updateBrightness } from '../engine/SceneManager.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { createIcons, $ } from '../utils/dom.js';

/**
 * Initialize sidebar: tabs, tree click/dblclick, visibility/lock/color
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
        $('btn-top-explorer').classList.toggle('active', !willOpen); // Wait, if it WILL open, it becomes active. So active=willOpen
        $('btn-top-explorer').classList.toggle('active', willOpen);
        $('btn-act-explorer').classList.toggle('active', willOpen);
        if (willOpen) EventBus.emit('ui:closeOthers', 'sidebar');
    };
    
    $('btn-top-explorer').addEventListener('click', toggleExplorer);
    $('btn-act-explorer').addEventListener('click', toggleExplorer);

    EventBus.on('ui:closeOthers', (source) => {
        if (source !== 'sidebar') {
            sidebarEl.classList.remove('open');
            $('btn-top-explorer').classList.remove('active');
            $('btn-act-explorer').classList.remove('active');
        }
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            $(btn.dataset.target).classList.add('active');
            EventBus.emit('selection:clear');
        });
    });

    // Tree click (select)
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.addEventListener('click', e => {
            const caret = e.target.closest('.caret');
            if (caret) {
                caret.classList.toggle('caret-down');
                const n = caret.parentElement.nextElementSibling;
                if (n) n.classList.toggle('active-tree');
                return;
            }
            if (e.target.closest('.layer-controls') || e.target.closest('.btn-add-node')) return;
            const item = e.target.closest('.tree-item');
            if (!item) { EventBus.emit('selection:clear'); return; }
            const li = item.parentElement;
            let mesh = null;
            if (li.dataset.type === 'elemento') {
                mesh = Registry.findStructureById(li.dataset.id);
            }
            EventBus.emit('selection:select', { mesh, li, showProps: false });
        });

        // Tree dblclick (select + show props)
        tab.addEventListener('dblclick', e => {
            if (e.target.closest('.layer-controls') || e.target.closest('.btn-add-node')) return;
            const item = e.target.closest('.tree-item');
            if (!item) return;
            const li = item.parentElement;
            let mesh = null;
            if (li.dataset.type === 'elemento') {
                mesh = Registry.findStructureById(li.dataset.id);
            }
            EventBus.emit('selection:select', { mesh, li, showProps: true });
        });
    });

    // Visibility toggle
    sidebarEl.addEventListener('click', e => {
        const btn = e.target.closest('.visibility-btn');
        const lockBtn = e.target.closest('.lock-btn');

        if (btn) {
            e.stopPropagation();
            const targetId = btn.dataset.target;
            const isGroup = btn.dataset.isGroup === 'true';
            const newState = btn.classList.contains('hidden-layer');
            btn.classList.toggle('hidden-layer', !newState);
            btn.innerHTML = newState ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';

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
                    childBtn.innerHTML = newState ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
                });
            }

            applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));
            createIcons();
            History.save();
        }

        if (lockBtn) {
            e.stopPropagation();
            const targetId = lockBtn.dataset.target;
            const isGroup = lockBtn.dataset.isGroup === 'true';
            const isLocked = lockBtn.classList.contains('is-locked');
            const newState = !isLocked;
            lockBtn.classList.toggle('is-locked', newState);
            lockBtn.innerHTML = newState ? '<i data-lucide="lock"></i>' : '<i data-lucide="unlock"></i>';

            Registry.getStructures().forEach(s => {
                if ((isGroup && s.userData.group === targetId) || s.userData.id === targetId)
                    s.userData.locked = newState;
            });

            if (isGroup) {
                document.querySelectorAll(`.lock-btn[data-parent="${targetId}"]`).forEach(childBtn => {
                    childBtn.classList.toggle('is-locked', newState);
                    childBtn.innerHTML = newState ? '<i data-lucide="lock"></i>' : '<i data-lucide="unlock"></i>';
                });
            }

            createIcons();
            const selectedMesh = State.get('selectedMesh');
            if (selectedMesh && (selectedMesh.userData.id === targetId || selectedMesh.userData.group === targetId)) {
                EventBus.emit('properties:refresh');
            }
            History.save();
        }
    });

    // Color picker real-time update
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
