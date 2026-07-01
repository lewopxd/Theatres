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
import { Settings } from '../core/Settings.js';
import { applyLayerVisibility } from '../engine/SceneManager.js';
import { PersonasEngine } from '../engine/PersonasEngine.js';

const propPanel = () => $('properties-panel');
const propHeader = () => $('prop-header');
const propContent = () => $('prop-content');

let animManifest = null;
let posesManifest = null;

/**
 * Initialize properties panel
 */
export function initPropertiesPanel() {
    const toggleProperties = () => {
        const p = $('properties-panel');
        const willOpen = p.classList.contains('collapsed');
        p.classList.toggle('collapsed');
        $('btn-top-properties').classList.toggle('active', willOpen);
        $('btn-act-properties').classList.toggle('active', willOpen);
        if (willOpen) EventBus.emit('ui:closeOthers', 'properties');
    };

    $('prop-header').addEventListener('click', toggleProperties);
    $('btn-top-properties').addEventListener('click', toggleProperties);
    $('btn-act-properties').addEventListener('click', toggleProperties);

    // Preload personas manifests
    PersonasEngine.fetchManifest('animaciones').then(d => animManifest = d);
    PersonasEngine.fetchManifest('poses').then(d => posesManifest = d);

    EventBus.on('ui:closeOthers', (source) => {
        if (source !== 'properties') {
            $('properties-panel').classList.add('collapsed');
            $('btn-top-properties').classList.remove('active');
            $('btn-act-properties').classList.remove('active');
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
        $('btn-top-properties').classList.add('active');
        $('btn-act-properties').classList.add('active');
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
    if (!mesh && (!li || li.dataset.type !== 'grupo')) {
        renderContainerProperties();
        insertDesktopBreadcrumb();
        return;
    }
    
    if (li && li.dataset.type === 'grupo') {
        const groupColorHex = li.querySelector('.layer-picker')?.value || '#ffffff';
        $('prop-title-path').innerHTML = getBreadcrumbPathHTML(li, groupColorHex);
        createIcons({ root: $('prop-title-path') });
        renderGroupProperties(li, groupColorHex);
        insertDesktopBreadcrumb();
        return;
    }

    const wire = Registry.findWireById(mesh.userData.id);
    const wireColorHex = wire ? `#${wire.userData.baseColor.getHexString()}` : '#ffffff';
    $('prop-title-path').innerHTML = getBreadcrumbPathHTML(li, wireColorHex);
    createIcons({ root: $('prop-title-path') });
    renderMeshProperties(mesh, wireColorHex, li);
    insertDesktopBreadcrumb();
}

function insertDesktopBreadcrumb() {
    const content = $('prop-content');
    const bc = document.createElement('div');
    bc.className = 'desktop-breadcrumb';
    bc.innerHTML = $('prop-title-path').innerHTML;
    content.insertBefore(bc, content.firstChild);
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

function applyGroupProperty(groupId, property, value) {
    const groupLi = document.querySelector(`li[data-id="${groupId}"]`);
    if (!groupLi) return;

    // Apply to DOM elements in this group (including nested)
    const descendants = groupLi.querySelectorAll('li[data-id]');
    descendants.forEach(li => {
        const id = li.dataset.id;
        const mesh = Registry.findStructureById(id);
        const wire = Registry.findWireById(id);

        if (property === 'color') {
            const picker = li.querySelector('.layer-picker');
            if (picker) picker.value = value;
            if (wire) {
                wire.userData.baseColor.set(value);
                syncSelectionEdges(mesh);
            }
        } else if (property === 'lock') {
            const btn = li.querySelector('.lock-btn');
            if (btn) {
                if (value) btn.classList.add('is-locked');
                else btn.classList.remove('is-locked');
                btn.innerHTML = `<i data-lucide="${value ? 'lock' : 'unlock'}"></i>`;
            }
            if (mesh) mesh.userData.locked = value;
        } else if (property === 'visibility') {
            const btn = li.querySelector('.visibility-btn');
            if (btn) {
                btn.classList.toggle('hidden-layer', !value);
                btn.innerHTML = `<i data-lucide="${value ? 'eye' : 'eye-off'}"></i>`;
            }
            if (mesh) mesh.userData.layerVisible = value;
            applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));
        }
    });

    createIcons({ root: groupLi });
}

function renderGroupProperties(li, groupColorHex) {
    const content = $('prop-content');
    content.innerHTML = '';
    
    const groupId = li.dataset.id;
    const isLocked = li.querySelector('.lock-btn').classList.contains('is-locked');
    const isVisible = !li.querySelector('.visibility-btn').classList.contains('hidden-layer');
    
    // Wrap in prop-tab-content and accordion so it matches desktop styles
    const tab1 = document.createElement('div');
    tab1.className = 'prop-tab-content active';

    const accHead1 = document.createElement('button');
    accHead1.className = 'accordion-header';
    accHead1.innerHTML = `General <i data-lucide="chevron-down"></i>`;
    tab1.appendChild(accHead1);

    const accBody1 = document.createElement('div');
    accBody1.className = 'accordion-body';
    
    // Group general section
    const secGeneral = document.createElement('div');
    secGeneral.className = 'prop-section';
    secGeneral.innerHTML = `<div class="prop-section-title">Grupo</div>`;
    
    // Name input
    const currentName = li.querySelector('.tree-item').textContent.trim();
    const nameRow = createPropRow('Nombre', 'text', currentName, v => {
        updateNodeName(li, v);
    });
    secGeneral.appendChild(nameRow);
    
    // Layer color
    secGeneral.appendChild(createPropRow('Color Capa', 'color', groupColorHex, v => {
        const picker = li.querySelector('.layer-picker');
        if (picker) picker.value = v;
        applyGroupProperty(groupId, 'color', v);
    }));

    accBody1.appendChild(secGeneral);
    tab1.appendChild(accBody1);
    content.appendChild(tab1);

    // Accordion interaction
    accHead1.addEventListener('click', () => {
        accHead1.classList.toggle('collapsed');
        accBody1.classList.toggle('collapsed');
    });
    createIcons({ root: content });
}

function updateNodeName(li, newName) {
    if (!li) return;
    const treeItem = li.querySelector('.tree-item');
    if (!treeItem) return;
    
    // The name is a text node inside tree-item.
    // It usually comes after the caret and icon.
    // We can safely replace the text nodes.
    Array.from(treeItem.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
            node.textContent = ' ' + newName + ' ';
        }
    });
    
    // If it's a mesh, update its userData.name too (although right now we just rely on DOM)
    if (li.dataset.type === 'elemento') {
        const mesh = Registry.findStructureById(li.dataset.id);
        if (mesh) mesh.userData.name = newName;
    }
    
    History.save();
    
    // Refresh breadcrumb if needed
    const propPath = $('prop-title-path');
    if (propPath) {
        propPath.innerHTML = getBreadcrumbPathHTML(li, li.querySelector('.layer-picker')?.value || '#ffffff');
        createIcons({ root: propPath });
    }
}

function renderMeshProperties(mesh, wireColorHex, li) {
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
    btnTab1.textContent = 'General';
    
    const btnTab2 = document.createElement('button');
    btnTab2.className = 'prop-tab-btn';
    btnTab2.textContent = 'Ubicación';
    
    const btnTab3 = document.createElement('button');
    btnTab3.className = 'prop-tab-btn';
    btnTab3.textContent = 'Color';

    const btnTab4 = document.createElement('button');
    btnTab4.className = 'prop-tab-btn';
    btnTab4.textContent = 'Material';
    
    tabsHeader.appendChild(btnTab1);
    tabsHeader.appendChild(btnTab2);
    tabsHeader.appendChild(btnTab3);
    if (mesh.material && mesh.material.isMeshStandardMaterial) tabsHeader.appendChild(btnTab4);
    content.appendChild(tabsHeader);

    // Tab 1: General (Name & Dimensions)
    const tab1 = document.createElement('div');
    tab1.className = 'prop-tab-content active';
    
    const accHead1 = document.createElement('button');
    accHead1.className = 'accordion-header';
    accHead1.innerHTML = `General <i data-lucide="chevron-down"></i>`;
    tab1.appendChild(accHead1);

    const accBody1 = document.createElement('div');
    accBody1.className = 'accordion-body';
    
    const secName = document.createElement('div');
    secName.className = 'prop-section';
    secName.innerHTML = `<div class="prop-section-title">General</div>`;
    const currentName = li ? li.querySelector('.tree-item').textContent.trim() : (data.name || 'Elemento');
    secName.appendChild(createPropRow('Nombre', 'text', currentName, v => updateNodeName(li, v)));
    accBody1.appendChild(secName);

    if (data.editable) {
        if (data.isPersona) {
            const secAna = document.createElement('div');
            secAna.className = 'prop-section';
            secAna.innerHTML = `<div class="prop-section-title">Anatomía (Alometría)</div>`;
            secAna.appendChild(createPropRow('Altura (m)', 'number', data.height.toFixed(2), v => {
                PersonasEngine.updateAllometry(mesh, parseFloat(v));
                syncSelectionEdges(mesh);
            }, 1.0, 0.01, isLocked));
            accBody1.appendChild(secAna);

            const secAnim = document.createElement('div');
            secAnim.className = 'prop-section';
            secAnim.innerHTML = `<div class="prop-section-title">Animación / Pose</div>`;
            if (animManifest) {
                const animOptions = { '': 'Ninguna' };
                animManifest.forEach(a => animOptions[a.file] = a.name);
                secAnim.appendChild(createPropSelect('Animación', animOptions, data.currentAction || '', async v => {
                    data.currentAction = v;
                    if (v) {
                        await PersonasEngine.loadAsset(mesh, `assets/modelos3d/personas/animaciones/${v}`, true);
                    } else if (mesh.userData.mixer) {
                        mesh.userData.mixer.stopAllAction();
                    }
                    syncSelectionEdges(mesh);
                }, isLocked));
            }
            if (posesManifest) {
                const posesOptions = { '': 'Ninguna' };
                posesManifest.forEach(p => posesOptions[p.file] = p.name);
                secAnim.appendChild(createPropSelect('Pose', posesOptions, data.currentAction || '', async v => {
                    data.currentAction = v;
                    if (v) {
                        await PersonasEngine.loadAsset(mesh, `assets/modelos3d/personas/poses/${v}`, false);
                    } else if (mesh.userData.mixer) {
                        mesh.userData.mixer.stopAllAction();
                    }
                    syncSelectionEdges(mesh);
                }, isLocked));
            }
            accBody1.appendChild(secAnim);
        } else {
            const secGeo = document.createElement('div');
            secGeo.className = 'prop-section';
            secGeo.innerHTML = `<div class="prop-section-title">Dimensiones</div>`;
            const p = data.geoParams;
            if (data.geoType === 'box') {
                secGeo.appendChild(createPropRow('Ancho (X)', 'number', p.w, v => updateGeometry('w', v), undefined, undefined, isLocked));
                if (Settings.get('visualZUp')) {
                    secGeo.appendChild(createPropRow('Prof (Y)', 'number', p.d, v => updateGeometry('d', v), undefined, undefined, isLocked));
                    secGeo.appendChild(createPropRow('Alto (Z)', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
                } else {
                    secGeo.appendChild(createPropRow('Alto (Y)', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
                    secGeo.appendChild(createPropRow('Prof (Z)', 'number', p.d, v => updateGeometry('d', v), undefined, undefined, isLocked));
                }
            } else if (data.geoType === 'cylinder' || data.geoType === 'cone') {
                secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
                secGeo.appendChild(createPropRow('Alto', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
            } else if (data.geoType === 'sphere') {
                secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
            }
            accBody1.appendChild(secGeo);
        }
    }
    tab1.appendChild(accBody1);
    content.appendChild(tab1);

    // Tab 2: Posición
    const tab2 = document.createElement('div');
    tab2.className = 'prop-tab-content';
    
    const accHead2 = document.createElement('button');
    accHead2.className = 'accordion-header';
    accHead2.innerHTML = `Ubicación <i data-lucide="chevron-down"></i>`;
    tab2.appendChild(accHead2);

    const accBody2 = document.createElement('div');
    accBody2.className = 'accordion-body';
    
    const secPos = document.createElement('div');
    secPos.className = 'prop-section';
    secPos.innerHTML = `<div class="prop-section-title">Ubicación (m)</div>`;
    secPos.appendChild(createPropRow('X', 'number', mesh.position.x.toFixed(2), v => updateMeshPos('x', parseFloat(v)), undefined, undefined, isLocked));
    if (Settings.get('visualZUp')) {
        secPos.appendChild(createPropRow('Y', 'number', mesh.position.z.toFixed(2), v => updateMeshPos('z', parseFloat(v)), undefined, undefined, isLocked));
        secPos.appendChild(createPropRow('Z', 'number', mesh.position.y.toFixed(2), v => updateMeshPos('y', parseFloat(v)), undefined, undefined, isLocked));
    } else {
        secPos.appendChild(createPropRow('Y', 'number', mesh.position.y.toFixed(2), v => updateMeshPos('y', parseFloat(v)), undefined, undefined, isLocked));
        secPos.appendChild(createPropRow('Z', 'number', mesh.position.z.toFixed(2), v => updateMeshPos('z', parseFloat(v)), undefined, undefined, isLocked));
    }
    accBody2.appendChild(secPos);
    tab2.appendChild(accBody2);
    content.appendChild(tab2);

    // Tab 3: Color & Estilo
    const tab3 = document.createElement('div');
    tab3.className = 'prop-tab-content';
    
    const accHead3 = document.createElement('button');
    accHead3.className = 'accordion-header';
    accHead3.innerHTML = `Color <i data-lucide="chevron-down"></i>`;
    tab3.appendChild(accHead3);

    const accBody3 = document.createElement('div');
    accBody3.className = 'accordion-body';
    
    const secColor = document.createElement('div');
    secColor.className = 'prop-section';
    secColor.innerHTML = `<div class="prop-section-title">Apariencia</div>`;
    
    const wire = Registry.findWireById(data.id);
    secColor.appendChild(createPropRow('Color Capa', 'color', wireColorHex, v => {
        if (wire) wire.userData.baseColor.set(v);
        const treeInput = document.querySelector(`.layer-picker[data-target="${data.id}"]`);
        if (treeInput) treeInput.value = v;
        syncSelectionEdges(mesh);
        const chevron = document.querySelector('.breadcrumb-chevron:last-of-type');
        if (chevron) chevron.style.color = v;
    }, undefined, undefined, isLocked));

    if (mesh.material) {
        secColor.appendChild(createPropRow('Relleno', 'color', `#${mesh.material.color.getHexString()}`, v => {
            mesh.material.color.set(v); data.materialPreset = 'custom';
            const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
        }, undefined, undefined, isLocked));

        secColor.appendChild(createPropRow('Opacidad', 'number', mesh.material.opacity, v => {
            mesh.material.opacity = parseFloat(v); data.materialPreset = 'custom';
            const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
        }, 0, 0.1, isLocked));
    }
    
    accBody3.appendChild(secColor);
    tab3.appendChild(accBody3);
    content.appendChild(tab3);

    // Tab 4: Material
    let tab4;
    let accHead4, accBody4;
    if (mesh.material && mesh.material.isMeshStandardMaterial) {
        tab4 = document.createElement('div');
        tab4.className = 'prop-tab-content';
        
        accHead4 = document.createElement('button');
        accHead4.className = 'accordion-header';
        accHead4.innerHTML = `Material <i data-lucide="chevron-down"></i>`;
        tab4.appendChild(accHead4);

        accBody4 = document.createElement('div');
        accBody4.className = 'accordion-body';
        
        const secMat = document.createElement('div');
        secMat.className = 'prop-section';
        secMat.innerHTML = `<div class="prop-section-title">Físicas</div>`;

        const presets = { 'custom': 'Personalizado', 'madera': 'Madera', 'metal': 'Metal', 'plastico': 'Plástico', 'cristal': 'Cristal' };
        const presetRow = createPropSelect('Preset', presets, data.materialPreset || 'custom', v => {
            data.materialPreset = v;
            if (v !== 'custom') {
                mesh.material.transparent = true;
                if (v === 'madera') { mesh.material.color.set('#8b5a2b'); mesh.material.roughness = 0.9; mesh.material.metalness = 0.0; mesh.material.opacity = 1.0; }
                if (v === 'metal') { mesh.material.color.set('#cccccc'); mesh.material.roughness = 0.2; mesh.material.metalness = 0.9; mesh.material.opacity = 1.0; }
                if (v === 'plastico') { mesh.material.color.set('#007acc'); mesh.material.roughness = 0.4; mesh.material.metalness = 0.1; mesh.material.opacity = 1.0; }
                if (v === 'cristal') { mesh.material.color.set('#e0ffff'); mesh.material.roughness = 0.05; mesh.material.metalness = 0.1; mesh.material.opacity = 0.4; }
                renderMeshProperties(mesh, wireColorHex, li);
            }
        }, isLocked);
        presetRow.querySelector('select').classList.add('material-preset-select');
        secMat.appendChild(presetRow);

        secMat.appendChild(createPropRow('Rugoso', 'number', mesh.material.roughness, v => {
            mesh.material.roughness = parseFloat(v); data.materialPreset = 'custom';
            const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
        }, 0, 0.1, isLocked));
        
        secMat.appendChild(createPropRow('Metal', 'number', mesh.material.metalness, v => {
            mesh.material.metalness = parseFloat(v); data.materialPreset = 'custom';
            const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
        }, 0, 0.1, isLocked));
        
        accBody4.appendChild(secMat);
        tab4.appendChild(accBody4);
        content.appendChild(tab4);
    }

    // Accordion interaction logic
    const accordions = [
        { head: accHead1, body: accBody1 },
        { head: accHead2, body: accBody2 },
        { head: accHead3, body: accBody3 }
    ];
    if (tab4) accordions.push({ head: accHead4, body: accBody4 });
    
    accordions.forEach(acc => {
        acc.head.addEventListener('click', () => {
            acc.head.classList.toggle('collapsed');
            acc.body.classList.toggle('collapsed');
        });
    });

    // Tab switching logic
    const tabs = [
        { btn: btnTab1, content: tab1 },
        { btn: btnTab2, content: tab2 },
        { btn: btnTab3, content: tab3 }
    ];
    if (tab4) tabs.push({ btn: btnTab4, content: tab4 });

    tabs.forEach(t => {
        t.btn.addEventListener('click', () => {
            tabs.forEach(x => {
                x.btn.classList.remove('active');
                x.content.classList.remove('active');
            });
            t.btn.classList.add('active');
            t.content.classList.add('active');
        });
    });

    createIcons({ root: content });
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
