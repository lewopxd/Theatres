// ============================================================
// TreeBuilder — Genera nodos del tree dinámicamente
// ============================================================

import * as THREE from 'three';
import { createStruct } from '../theatre/StructureBuilder.js';
import { History } from '../core/History.js';
import { State } from '../core/State.js';
import { contextMenu } from './ContextMenuAPI.js';
import { createIcons } from '../utils/dom.js';

/**
 * Initialize the add buttons for Escenografía tab
 */
export function initTreeBuilder() {
    const btnAddEsc = document.querySelector('#tab-esc .btn-add-node');
    if (btnAddEsc) {
        btnAddEsc.addEventListener('click', e => {
            e.stopPropagation();
            const rect = btnAddEsc.getBoundingClientRect();
            contextMenu.show(rect.left, rect.bottom + 5, [
                { icon: 'folder', label: 'Grupo', action: () => { addTreeElement('Nuevo Grupo', 'folder', 'grupo'); History.save(); } },
                { icon: 'box', label: 'Cubo', action: () => { addTreeElement('Cubo', 'box', 'box'); History.save(); } },
                { icon: 'database', label: 'Cilindro', action: () => { addTreeElement('Cilindro', 'database', 'cylinder'); History.save(); } },
                { icon: 'circle', label: 'Esfera', action: () => { addTreeElement('Esfera', 'circle', 'sphere'); History.save(); } },
                { icon: 'triangle', label: 'Cono', action: () => { addTreeElement('Cono', 'triangle', 'cone'); History.save(); } },
            ]);
        });
    }
}

function addTreeElement(name, icon, type) {
    let parentLi = State.get('selectedLi');
    if (parentLi && parentLi.dataset.type !== 'grupo') parentLi = parentLi.parentElement.closest('li');

    const li = document.createElement('li');
    const isGroup = type === 'grupo';
    const id = `item-${Date.now()}`;
    li.dataset.type = isGroup ? 'grupo' : 'elemento';
    li.dataset.id = id;

    let targetUl;
    const activeTab = document.querySelector('.tab-content.active');
    let lvl = 1;
    let parentGroupId = 'escenografia';

    if (parentLi) {
        targetUl = parentLi.querySelector(':scope > ul.nested');
        if (!targetUl) {
            targetUl = document.createElement('ul');
            targetUl.className = 'nested active-tree';
            parentLi.appendChild(targetUl);
            const pItem = parentLi.querySelector('.tree-item');
            if (!pItem.querySelector('.caret')) {
                const c = document.createElement('span');
                c.className = 'caret caret-down';
                pItem.insertBefore(c, pItem.firstChild);
                const spacing = pItem.querySelector('span[style*="width:18px"]');
                if (spacing) spacing.remove();
            }
        }
        parentGroupId = parentLi.dataset.id || 'root';
        let cur = targetUl;
        while (cur && cur.classList.contains('nested')) {
            lvl++;
            cur = cur.parentElement.parentElement?.closest('ul.nested');
        }
    } else {
        targetUl = activeTab.querySelector('ul.tree');
    }

    let html = `<div class="tree-item" style="padding-left: ${lvl * 15 + 5}px;">`;
    html += isGroup ? '<span class="caret"></span>' : '<span style="width:18px; display:inline-block"></span>';
    html += `<i data-lucide="${icon}" class="node-icon"></i> ${name} `;

    const isGrpStr = isGroup ? 'data-is-group="true"' : '';
    html += `<div class="layer-controls">
        <button class="visibility-btn" data-target="${id}" data-parent="${parentGroupId}" ${isGrpStr}><i data-lucide="eye"></i></button>
        <button class="lock-btn" data-target="${id}" data-parent="${parentGroupId}" ${isGrpStr}><i data-lucide="unlock"></i></button>
        <input type="color" class="color-picker layer-picker" data-target="${id}" data-parent="${parentGroupId}" ${isGrpStr} value="#007acc">
    </div></div>`;

    if (isGroup) html += `<ul class="nested active-tree"></ul>`;
    li.innerHTML = html;
    targetUl.appendChild(li);
    createIcons({ root: li });

    if (!isGroup) {
        let geo, params;
        switch (type) {
            case 'box': geo = new THREE.BoxGeometry(1, 1, 1); params = { w: 1, h: 1, d: 1 }; break;
            case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
            case 'sphere': geo = new THREE.SphereGeometry(0.5, 16, 16); params = { r: 0.5 }; break;
            case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
        }
        const mat = new THREE.MeshStandardMaterial({ color: 0x6a7b8e, transparent: true });
        createStruct(geo, mat, '#007acc', id, parentGroupId, 0, 0.5, 0, 0, type, params);
    }
}
