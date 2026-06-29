// ============================================================
// PropertiesPanel — Panel de propiedades inferior
// ============================================================

import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { Registry } from '../core/Registry.js';
import { History } from '../core/History.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { baseBgColor, updateBrightness } from '../engine/SceneManager.js';
import { updateMeshPos, updateGeometry } from '../tools/MoveTool.js';
import { MoveHandle } from '../engine/MoveHandle.js';
import { createIcons, $ } from '../utils/dom.js';

const propPanel = () => $('properties-panel');
const propHeader = () => $('prop-header');
const propContent = () => $('prop-content');

/**
 * Initialize properties panel
 */
export function initPropertiesPanel() {
    $('prop-header').addEventListener('click', () => {
        const p = $('properties-panel');
        const willOpen = p.classList.contains('collapsed');
        p.classList.toggle('collapsed');
        if (willOpen) EventBus.emit('ui:closeOthers', 'properties');
    });

    EventBus.on('ui:closeOthers', (source) => {
        if (source !== 'properties') {
            $('properties-panel').classList.add('collapsed');
        }
    });

    // Listen for selection events
    EventBus.on('selection:select', ({ mesh, li, showProps }) => {
        selectObject(mesh, li, showProps);
    });

    EventBus.on('selection:clear', () => {
        deselectAll();
    });

    EventBus.on('selection:restored', ({ mesh }) => {
        const li = document.querySelector(`li[data-id="${mesh.userData.id}"]`);
        selectObject(mesh, li, !propPanel().classList.contains('collapsed'));
    });

    EventBus.on('properties:refresh', () => {
        const mesh = State.get('selectedMesh');
        if (mesh && !propPanel().classList.contains('collapsed')) {
            const wire = Registry.findWireById(mesh.userData.id);
            renderMeshProperties(mesh, `#${wire?.userData.baseColor.getHexString() || 'ffffff'}`);
        }
    });

    EventBus.on('properties:refreshLive', () => {
        const mesh = State.get('selectedMesh');
        if (mesh && !propPanel().classList.contains('collapsed')) {
            const wire = Registry.findWireById(mesh.userData.id);
            renderMeshProperties(mesh, `#${wire?.userData.baseColor.getHexString() || 'ffffff'}`);
        }
    });
}

/**
 * Select an object and update UI
 */
export function selectObject(mesh, li, showProps = false) {
    State.set('selectedMesh', mesh);
    State.set('selectedLi', li);

    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
    if (li) {
        const ti = li.querySelector(':scope > .tree-item');
        if (ti) ti.classList.add('selected');
        let p = li.parentElement;
        while (p && p.classList.contains('nested')) {
            p.classList.add('active-tree');
            const caret = p.previousElementSibling?.querySelector('.caret');
            if (caret) caret.classList.add('caret-down');
            p = p.parentElement?.parentElement;
        }
    }

    syncSelectionEdges(mesh);
    MoveHandle.hide();
    EventBus.emit('statusbar:coords', { mesh });
    updatePropertiesContent(mesh, li);
    if (showProps && propPanel().classList.contains('collapsed')) {
        propPanel().classList.remove('collapsed');
        EventBus.emit('ui:closeOthers', 'properties');
    }
}

/**
 * Deselect all
 */
export function deselectAll() {
    selectObject(null, null);
}

function updatePropertiesContent(mesh, li) {
    if (!mesh) {
        renderContainerProperties();
        return;
    }
    const wire = Registry.findWireById(mesh.userData.id);
    const wireColorHex = wire ? `#${wire.userData.baseColor.getHexString()}` : '#ffffff';
    $('prop-title-path').innerHTML = getBreadcrumbPathHTML(li, wireColorHex);
    createIcons({ root: $('prop-title-path') });
    renderMeshProperties(mesh, wireColorHex);
}

function renderContainerProperties() {
    $('prop-title-path').innerHTML = `<span>Contenedor</span>`;
    const content = $('prop-content');
    content.innerHTML = '';
    const secBg = document.createElement('div');
    secBg.className = 'prop-section';
    secBg.innerHTML = `<div class="prop-section-title">Entorno</div>`;
    secBg.appendChild(createPropRow('Fondo', 'color', `#${baseBgColor.getHexString()}`, v => {
        baseBgColor.set(v);
        const slider = $('brightness-slider');
        updateBrightness(slider ? parseFloat(slider.value) : 1);
        History.save();
    }));
    content.appendChild(secBg);
}

function createPropRow(label, type, value, onChange, min = 0.1, step = 0.1, disabled = false) {
    const div = document.createElement('div');
    div.className = 'prop-row';
    const disAttr = disabled ? 'disabled' : '';
    div.innerHTML = `<label>${label}</label><input type="${type}" class="prop-input" value="${value}" ${type === 'number' ? `min="${min}" step="${step}"` : ''} ${disAttr}>`;
    div.querySelector('input').addEventListener('change', e => {
        onChange(e.target.value);
        History.save();
    });
    return div;
}

function createPropSelect(label, optionsObj, value, onChange, disabled = false) {
    const div = document.createElement('div');
    div.className = 'prop-row';
    const disAttr = disabled ? 'disabled' : '';
    let opts = Object.entries(optionsObj).map(([k, v]) =>
        `<option value="${k}" ${k === value ? 'selected' : ''}>${v}</option>`
    ).join('');
    div.innerHTML = `<label>${label}</label><select class="prop-input" ${disAttr}>${opts}</select>`;
    div.querySelector('select').addEventListener('change', e => {
        onChange(e.target.value);
        History.save();
    });
    return div;
}

function renderMeshProperties(mesh, wireColorHex) {
    const content = $('prop-content');
    content.innerHTML = '';
    if (!mesh) return;
    const data = mesh.userData;
    const isLocked = data.locked;

    // Create Tabs Header
    const tabsHeader = document.createElement('div');
    tabsHeader.className = 'prop-tabs-header';
    
    const btnTab1 = document.createElement('button');
    btnTab1.className = 'prop-tab-btn active';
    btnTab1.textContent = 'Transformación';
    
    const btnTab2 = document.createElement('button');
    btnTab2.className = 'prop-tab-btn';
    btnTab2.textContent = 'Materiales';
    
    tabsHeader.appendChild(btnTab1);
    tabsHeader.appendChild(btnTab2);
    content.appendChild(tabsHeader);

    // Create Tab 1 Content (Transform & Dimensions)
    const tab1 = document.createElement('div');
    tab1.className = 'prop-tab-content active';

    // Position section
    const secPos = document.createElement('div');
    secPos.className = 'prop-section';
    secPos.innerHTML = `<div class="prop-section-title">Ubicación (m)</div>`;
    secPos.appendChild(createPropRow('X', 'number', mesh.position.x.toFixed(2), v => updateMeshPos('x', parseFloat(v)), undefined, undefined, isLocked));
    secPos.appendChild(createPropRow('Y', 'number', mesh.position.y.toFixed(2), v => updateMeshPos('y', parseFloat(v)), undefined, undefined, isLocked));
    secPos.appendChild(createPropRow('Z', 'number', mesh.position.z.toFixed(2), v => updateMeshPos('z', parseFloat(v)), undefined, undefined, isLocked));
    tab1.appendChild(secPos);

    // Geometry section (editable only)
    if (data.editable) {
        const secGeo = document.createElement('div');
        secGeo.className = 'prop-section';
        secGeo.innerHTML = `<div class="prop-section-title">Dimensiones</div>`;
        const p = data.geoParams;
        if (data.geoType === 'box') {
            secGeo.appendChild(createPropRow('Ancho', 'number', p.w, v => updateGeometry('w', v), undefined, undefined, isLocked));
            secGeo.appendChild(createPropRow('Alto', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
            secGeo.appendChild(createPropRow('Prof', 'number', p.d, v => updateGeometry('d', v), undefined, undefined, isLocked));
        } else if (data.geoType === 'cylinder' || data.geoType === 'cone') {
            secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
            secGeo.appendChild(createPropRow('Alto', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
        } else if (data.geoType === 'sphere') {
            secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
        }
        tab1.appendChild(secGeo);
    }
    content.appendChild(tab1);

    // Create Tab 2 Content (Appearance & Material)
    const tab2 = document.createElement('div');
    tab2.className = 'prop-tab-content';

    // Layer section
    const secCapa = document.createElement('div');
    secCapa.className = 'prop-section';
    secCapa.innerHTML = `<div class="prop-section-title">Capa</div>`;
    const wire = Registry.findWireById(data.id);
    secCapa.appendChild(createPropRow('Color Wire', 'color', wireColorHex, v => {
        if (wire) wire.userData.baseColor.set(v);
        const treeInput = document.querySelector(`.layer-picker[data-target="${data.id}"]`);
        if (treeInput) treeInput.value = v;
        syncSelectionEdges(mesh);
        const chevron = document.querySelector('.breadcrumb-chevron:last-of-type');
        if (chevron) chevron.style.color = v;
    }, undefined, undefined, isLocked));
    tab2.appendChild(secCapa);

    // Material section
    const secStyle = document.createElement('div');
    secStyle.className = 'prop-section';
    secStyle.innerHTML = `<div class="prop-section-title">Apariencia y Material</div>`;

    const presets = { 'custom': 'Personalizado', 'madera': 'Madera', 'metal': 'Metal', 'plastico': 'Plástico', 'cristal': 'Cristal' };
    secStyle.appendChild(createPropSelect('Preset', presets, data.materialPreset || 'custom', v => {
        data.materialPreset = v;
        if (v !== 'custom') {
            mesh.material.transparent = true;
            if (v === 'madera') { mesh.material.color.set('#8b5a2b'); mesh.material.roughness = 0.9; mesh.material.metalness = 0.0; mesh.material.opacity = 1.0; }
            if (v === 'metal') { mesh.material.color.set('#cccccc'); mesh.material.roughness = 0.2; mesh.material.metalness = 0.9; mesh.material.opacity = 1.0; }
            if (v === 'plastico') { mesh.material.color.set('#007acc'); mesh.material.roughness = 0.4; mesh.material.metalness = 0.1; mesh.material.opacity = 1.0; }
            if (v === 'cristal') { mesh.material.color.set('#e0ffff'); mesh.material.roughness = 0.05; mesh.material.metalness = 0.1; mesh.material.opacity = 0.4; }
            renderMeshProperties(mesh, wireColorHex);
        }
    }, isLocked));

    secStyle.appendChild(createPropRow('Relleno', 'color', `#${mesh.material.color.getHexString()}`, v => {
        mesh.material.color.set(v); data.materialPreset = 'custom';
        const sel = secStyle.querySelector('select'); if (sel) sel.value = 'custom';
    }, undefined, undefined, isLocked));

    secStyle.appendChild(createPropRow('Opacidad', 'number', mesh.material.opacity, v => {
        mesh.material.opacity = parseFloat(v); data.materialPreset = 'custom';
        const sel = secStyle.querySelector('select'); if (sel) sel.value = 'custom';
    }, 0, 0.1, isLocked));

    if (mesh.material.isMeshStandardMaterial) {
        secStyle.appendChild(createPropRow('Rugoso', 'number', mesh.material.roughness, v => {
            mesh.material.roughness = parseFloat(v); data.materialPreset = 'custom';
            const sel = secStyle.querySelector('select'); if (sel) sel.value = 'custom';
        }, 0, 0.1, isLocked));
        secStyle.appendChild(createPropRow('Metal', 'number', mesh.material.metalness, v => {
            mesh.material.metalness = parseFloat(v); data.materialPreset = 'custom';
            const sel = secStyle.querySelector('select'); if (sel) sel.value = 'custom';
        }, 0, 0.1, isLocked));
    }
    tab2.appendChild(secStyle);
    content.appendChild(tab2);

    // Tab switching logic
    btnTab1.addEventListener('click', () => {
        btnTab1.classList.add('active');
        btnTab2.classList.remove('active');
        tab1.classList.add('active');
        tab2.classList.remove('active');
    });

    btnTab2.addEventListener('click', () => {
        btnTab2.classList.add('active');
        btnTab1.classList.remove('active');
        tab2.classList.add('active');
        tab1.classList.remove('active');
    });
}

function getBreadcrumbPathHTML(li, colorHex) {
    if (!li) return `<span>Contenedor</span>`;
    const path = [];
    let current = li;
    while (current && current.tagName === 'LI') {
        const itemDiv = current.querySelector(':scope > .tree-item');
        if (itemDiv) {
            const clone = itemDiv.cloneNode(true);
            clone.querySelectorAll('.caret, .node-icon, .layer-controls, span[style]').forEach(el => el.remove());
            path.unshift(clone.textContent.trim());
        }
        current = current.parentElement.closest('li');
    }
    let html = '';
    for (let i = 0; i < path.length; i++) {
        if (i > 0) {
            const isLast = (i === path.length - 1);
            const colorStyle = isLast && colorHex ? `style="color: ${colorHex}; opacity: 1;"` : 'style="opacity: 0.5;"';
            html += `<i data-lucide="chevron-right" class="breadcrumb-chevron" ${colorStyle}></i>`;
        }
        html += `<span>${path[i]}</span>`;
    }
    return html;
}
